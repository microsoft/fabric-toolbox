using System.Net;
using OneLakeOpenMirroringExample.UkHousePrices;

namespace OneLakeOpenMirroringExample.Tests.UkHousePrices;

[TestFixture]
public class LandRegistryPricePaidDataProviderTests
{
    private LandRegistryPricePaidDataProvider landRegistryPricePaidDataProvider;
    private Dictionary<Uri, (bool Success, Stream Stream)> stubbedResults;
    
    [SetUp]
    public void Setup()
    {
        stubbedResults = new Dictionary<Uri, (bool Success, Stream Stream)>();
        var client = new HttpClient(new FakeHttpHandler(stubbedResults));
        landRegistryPricePaidDataProvider = new LandRegistryPricePaidDataProvider(client);
    }
    
    [Test]
    public async Task when_reading_current_month_data()
    {
        SetupSuccess(
            new Uri("http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-monthly-update-new-version.csv"), 
            PricePaidCsvParserTests.ExampleLineFromMonthlyFile);

        var result = await landRegistryPricePaidDataProvider.ReadCurrentMonth().CountAsync();
        Assert.That(result, Is.EqualTo(1));
    }
    
    [Test]
    public async Task when_reading_complete_data()
    {
        SetupSuccess(
            new Uri("http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-complete.csv"), 
            PricePaidCsvParserTests.ExampleLineFromYearlyFile);

        var result = await landRegistryPricePaidDataProvider.ReadCompleteData().CountAsync();
        Assert.That(result, Is.EqualTo(1));
    }
    
    void SetupSuccess(Uri uri, string csv)
    {
        var stream = new MemoryStream();
        var writer = new StreamWriter(stream);
        writer.WriteLine(csv);
        writer.Flush();
        stream.Position = 0;
        stubbedResults[uri] = (true, stream);
    }
    
    class FakeHttpHandler(Dictionary<Uri, (bool Success, Stream Stream)> stubbedResults) : HttpClientHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.Method != HttpMethod.Get || request.RequestUri == null)
            {
                throw new InvalidOperationException("Only setup for stubbing get calls with a valid uri");
            }

            var result = stubbedResults[request.RequestUri];
            HttpResponseMessage httpResponseMessage;
            if (result.Success)
            {
                httpResponseMessage = new HttpResponseMessage(HttpStatusCode.OK);
                httpResponseMessage.Content = new StreamContent(result.Stream);
            }
            else
            {
                httpResponseMessage = new HttpResponseMessage(HttpStatusCode.NotFound);
            }

            return Task.FromResult(httpResponseMessage);
        }
    }
}