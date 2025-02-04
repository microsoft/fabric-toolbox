using SQLMirroring;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Data;
using Apache.Arrow;

namespace GenericMirroring.sources
{
    public static class Sharepoint
    {
        public static async Task<string> GetAccessTokenAsync(string sharepoint_tenantId, string sharepoint_clientId, string sharepoint_clientSecret,string sharepoint_scope)
        {
            using (HttpClient client = new HttpClient())
            {
                var tokenUrl = $"https://login.microsoftonline.com/{sharepoint_tenantId}/oauth2/v2.0/token";
                var requestBody = new StringContent($"client_id={sharepoint_clientId}&client_secret={sharepoint_clientSecret}&scope={sharepoint_scope}&grant_type=client_credentials", Encoding.UTF8, "application/x-www-form-urlencoded");

                HttpResponseMessage response = await client.PostAsync(tokenUrl, requestBody);
                response.EnsureSuccessStatusCode();

                var responseBody = await response.Content.ReadAsStringAsync();
                dynamic tokenResponse = JsonConvert.DeserializeObject(responseBody);

                return tokenResponse.access_token;
            }
        }

        // Call REST API with Bearer Token
        public static async Task<string> CallApiAsync(string sharepoint_apiEndpoint, string token)
        {
            using (HttpClient client = new HttpClient())
            {
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
                HttpResponseMessage response = await client.GetAsync(sharepoint_apiEndpoint);

                response.EnsureSuccessStatusCode();
                string responseBody = await response.Content.ReadAsStringAsync();
                // Console.WriteLine("API Response: " + responseBody);

                return responseBody;
            }
        }

        public static async Task<string> ExtractSharepoint(SharepointConfig spDetails, SharepointLists list)
        {
            string token = await GetAccessTokenAsync(spDetails.Sharepoint_TenantID, spDetails.Sharepoint_ClientID, spDetails.Sharepoint_Secret, spDetails.Sharepoint_Scope);

            string ep = string.Concat(spDetails.Sharepoint_BaseAPI, list.List);

            string jsonResponse = await CallApiAsync(ep, token);

            return jsonResponse;

        }

        static public SimpleCache<string, DataTable> cache = new SimpleCache<string, DataTable>(TimeSpan.FromHours(10));
        static public DataTable ConvertListoDataTable(SharepointLists list, string t, DataTable dataTable)
        {
            string collist = "";
            if (list.ColumnList != null)  collist = list.ColumnList.ToLower(); 

                                Console.WriteLine("done");
                //https://graph.microsoft.com/v1.0/sites/root/lists/5d000404-f65a-49f0-b561-621c3cd52f2d/items?$expand=fields


                JObject parsedJson = JObject.Parse(t);


                dataTable.Columns.Add($"__rowMarker__", typeof(int));
                //dataTable.Columns.Add($"id", typeof(int));


                // Extract fields and dynamically create columns
                bool columnsCreated = false;
                foreach (var item in parsedJson["value"])
                {
                    var fields = item["fields"].ToObject<Dictionary<string, object>>();
                    if (!columnsCreated)
                    {
                        foreach (var key in fields.Keys)
                        {
                            if (collist.Length == 0 || collist.Contains(key.ToLower()))
                                dataTable.Columns.Add(key, typeof(string)); // Assuming all data is string for simplicity
                        }
                        columnsCreated = true;
                    }

                    // Add row data
                    DataRow row = dataTable.NewRow();

                    row[0] = 1;

                    foreach (var kvp in fields)
                    {
                        if (collist.Length == 0 || (collist.Contains(kvp.Key.ToLower()) || kvp.Key.ToLower() == "id"))
                            row[kvp.Key] = kvp.Value?.ToString() ?? string.Empty;
                    }


                    dataTable.Rows.Add(row);
                }



                list.LastUpdate = DateTime.Now;
            return dataTable;
        }

        static public Boolean CheckforChanges(string tablename, DataTable dataTable)
        {
            if (cache.TryGetValue(helper.ComputeHash(tablename), out DataTable value))
            {
                if (helper.DoDatatablesMatch(dataTable, value)) return false;
            }
            cache.Add(helper.ComputeHash(tablename), dataTable);
            return true;
        }
    }
}
