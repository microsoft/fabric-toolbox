[StagingDefinition = [Kind = "FastCopy"]]
section Section1;
shared #"New Users" = let
  Source = Csv.Document(Web.Contents("https://eastus201092026-my.sharepoint.com/personal/adminuser01_eastus201092026_onmicrosoft_com/Documents/Apps/Microsoft Power Query/Uploaded Files/active.csv"), [Delimiter = ",", Columns = 13, QuoteStyle = QuoteStyle.None]),
  #"Promoted headers" = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),
  #"Changed column type" = Table.TransformColumnTypes(#"Promoted headers", {{"RowNumber", Int64.Type}, {"CustomerId", Int64.Type}, {"Surname", type text}, {"CreditScore", Int64.Type}, {"Geography", type text}, {"Gender", type text}, {"Age", Int64.Type}, {"Tenure", Int64.Type}, {"Balance", type number}, {"NumOfProducts", Int64.Type}, {"HasCrCard", Int64.Type}, {"IsActiveMember", Int64.Type}, {"EstimatedSalary", type number}})
in
  #"Changed column type";
shared fnFeatureEngineering = (tbl as table) as table =>
let
    // --- helpers ---
    ToNumberOrNull = (x as any) as nullable number =>
        let n = try Number.From(x) otherwise null in n,

    // Equal-width binning:
    // score = 1..bins based on (x - min) / (max - min)
    AddEqualWidthBinScore =
        (t as table, col as text, bins as number, newCol as text) as table =>
        let
            valuesRaw = Table.Column(t, col),
            values = List.RemoveNulls(List.Transform(valuesRaw, each try Number.From(_) otherwise null)),
            mn = if List.Count(values) = 0 then null else List.Min(values),
            mx = if List.Count(values) = 0 then null else List.Max(values),
            range = if mn = null or mx = null then null else (mx - mn),
            withScore =
                Table.AddColumn(
                    t,
                    newCol,
                    (r as record) =>
                        let
                            x = try Number.From(Record.Field(r, col)) otherwise null,
                            // if no usable range, return null (or 1 if you prefer)
                            score =
                                if x = null or mn = null or mx = null or range = null or range = 0 then
                                    null
                                else
                                    let
                                        // normalized position in [0,1]
                                        p = (x - mn) / range,
                                        // map to 1..bins
                                        raw = Number.RoundDown(p * bins) + 1,
                                        clamped = if raw < 1 then 1 else if raw > bins then bins else raw
                                    in
                                        clamped
                        in
                            score,
                    Int64.Type
                )
        in
            withScore,

    // --- main pipeline ---
    // Drop columns
    Dropped =
        Table.RemoveColumns(
            tbl,
            {"RowNumber", "Surname"},
            MissingField.Ignore
        ),

    // Tenure -> Int64 if it exists
    Typed =
        Table.TransformColumnTypes(
            Dropped,
            {{"Tenure", Int64.Type}},
            "en-US"
        ),

    // NewTenure = Tenure / Age (null-safe, div0-safe)
    AddNewTenure =
        Table.AddColumn(
            Typed,
            "NewTenure",
            each
                let
                    age = ToNumberOrNull([Age]),
                    ten = ToNumberOrNull(Record.FieldOrDefault(_, "Tenure", null))
                in
                    if age = null or age = 0 or ten = null then null else ten / age,
            type number
        ),

    // Equal-width bins (NO SORT)
    WithCreditBins = AddEqualWidthBinScore(AddNewTenure, "CreditScore", 6, "NewCreditsScore"),
    WithAgeBins    = AddEqualWidthBinScore(WithCreditBins, "Age", 8, "NewAgeScore"),
    WithBalBins    = AddEqualWidthBinScore(WithAgeBins, "Balance", 5, "NewBalanceScore"),

    // NOTE: your column name might be EstimateSalary or EstimatedSalary. This handles both.
    SalaryCol =
        if Table.HasColumns(WithBalBins, "EstimateSalary") then "EstimateSalary"
        else if Table.HasColumns(WithBalBins, "EstimatedSalary") then "EstimatedSalary"
        else null,

    WithSalBins =
        if SalaryCol = null
        then WithBalBins
        else AddEqualWidthBinScore(WithBalBins, SalaryCol, 10, "NewEstSalaryScore"),

    // One-hot Geography
    GeoFrance  = Table.AddColumn(WithSalBins, "Geography_France",  each if Record.FieldOrDefault(_, "Geography", null) = "France"  then 1 else 0, Int64.Type),
    GeoGermany = Table.AddColumn(GeoFrance,  "Geography_Germany", each if Record.FieldOrDefault(_, "Geography", null) = "Germany" then 1 else 0, Int64.Type),
    GeoSpain   = Table.AddColumn(GeoGermany, "Geography_Spain",   each if Record.FieldOrDefault(_, "Geography", null) = "Spain"   then 1 else 0, Int64.Type),

    // One-hot Gender
    GenMale   = Table.AddColumn(GeoSpain, "Gender_Male",   each if Record.FieldOrDefault(_, "Gender", null) = "Male"   then 1 else 0, Int64.Type),
    GenFemale = Table.AddColumn(GenMale,  "Gender_Female", each if Record.FieldOrDefault(_, "Gender", null) = "Female" then 1 else 0, Int64.Type),

    // Drop original categoricals + any leftover RowNumber if present
    Final =
        Table.RemoveColumns(
            GenFemale,
            {"Geography", "Gender", "RowNumber"},
            MissingField.Ignore
        )
in
    Final;
shared PredictChurnRisk = (input as table) as table =>
let 
    // Feature engineering
    features = fnFeatureEngineering(input),

    // Build JSON request body 
    jsonBody = 
        "{""inputs"":" & 
        Text.FromBinary( 
            Json.FromValue( 
                List.Transform( 
                    Table.ToRows(features), 
                    each _ 
                ) 
            ) 
        ) & 
        "}", 
    // OAuth parameters 
    TenantId     = "<replace with your tenant id>", 
    ClientId     = "<replace with your client id>", 
    ClientSecret = "<replace with your secret>", 
    Scope        = "https://api.fabric.microsoft.com/.default", 
    TokenUrl = "https://login.microsoftonline.com/" & TenantId & "/oauth2/v2.0/token", 

    FormEncode = 
        (fields as record) as text => 
            Text.Combine( 
                List.Transform( 
                    Record.FieldNames(fields), 
                    (k) => 
                        Uri.EscapeDataString(k) & "=" & 
                        Uri.EscapeDataString(Text.From(Record.Field(fields, k))) 
                ), 
                "&" 
            ), 
 
    TokenBodyText = 
        FormEncode([ 
            client_id     = ClientId, 
            client_secret = ClientSecret, 
            grant_type    = "client_credentials", 
            scope         = Scope 
        ]), 
 
    TokenResponse = 
        Json.Document(
            Web.Contents( 
                TokenUrl, 
                [ 
                    Headers = [#"Content-Type" = "application/x-www-form-urlencoded"], 
                    Content = Text.ToBinary(TokenBodyText) 
                ] 
            ) 
        ), 

    AccessToken = TokenResponse[access_token], 

     // Call ML model endpoint 
    ScoreUrl = "<replace with your ML endpoint score URL>", 

    response = 
        Json.Document( 
            Web.Contents( 
                ScoreUrl, 
                [ 
                    Headers = [ 
                        #"Content-Type"  = "application/json", 
                        #"Authorization" = "Bearer " & AccessToken 
                    ], 
                    Content = Text.ToBinary(jsonBody) 
                ] 
            ) 
        ), 
    //  Parse orientation=values output 
    PredictionsRaw = response[predictions],  
    PredictionValues = List.Transform(PredictionsRaw, each _{0}), 
    ProbabilityValues = List.Transform(PredictionsRaw, each _{1}), 

    //  Append columns to table 
    Result = 
        Table.FromColumns( 
            Table.ToColumns(features) & 
                { PredictionValues, ProbabilityValues }, 
            Table.ColumnNames(features) & 
                { "prediction", "probability" } 
        ) 
in 

    Result;
