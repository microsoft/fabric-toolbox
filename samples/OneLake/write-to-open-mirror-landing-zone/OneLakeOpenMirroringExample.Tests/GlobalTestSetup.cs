namespace OneLakeOpenMirroringExample.Tests;

using NUnit.Framework;

[SetUpFixture]
public class GlobalTestSetup
{
    [OneTimeTearDown]
    public async Task RunAfterAllTests() => await AzuriteHost.EnsureStopped();
}