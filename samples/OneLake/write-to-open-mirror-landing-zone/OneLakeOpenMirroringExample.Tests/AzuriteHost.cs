using System.Diagnostics;
using System.Net.Sockets;
using Azure.Storage.Blobs;
using OneLakeOpenMirroringExample.Storage;

namespace OneLakeOpenMirroringExample.Tests;

public class AzuriteHost
{
    private static AzuriteHost? instance;
    
    private readonly Process process;
    
    private AzuriteHost(Process process)
    {
        this.process = process;
    }
    
    static async Task<AzuriteHost> Start()
    {
        var isWindows = OperatingSystem.IsWindows();
        var npxCommand = isWindows ? "azurite.cmd" : "azurite";

        var azuriteProcess = Process.Start(new ProcessStartInfo
        {
            FileName = npxCommand,
            Arguments = "--silent --location ./azurite_data --debug ./azurite_debug.log",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        });

        if (azuriteProcess == null)
        {
            throw new Exception("Failed to start Azurite process.");
        }

        var success = await WaitForPort("127.0.0.1", 10000, 5000);

        if (!success)
        {
            throw new Exception("Failed to connect to Azurite process.");
        }

        return new AzuriteHost(azuriteProcess);
    }
    
    private static async Task<bool> WaitForPort(string host, int port, int timeoutMs)
    {
        var start = DateTime.UtcNow;
        while ((DateTime.UtcNow - start).TotalMilliseconds < timeoutMs)
        {
            try
            {
                using var client = new TcpClient();
                await client.ConnectAsync(host, port);
                if (client.Connected)
                {
                    return true;
                }
            }
            catch
            {
                // Ignore and retry
            }

            await Task.Delay(100);
        }
        return false;
    }
    
    public async Task Stop()
    {
        if (!process.HasExited)
        {
            process.Kill();
            await process.WaitForExitAsync();
        }
    }

    public static async Task<BlobServiceClient> GetBlobServiceClientUsingAzurite()
    {
        instance ??= await Start();
        return new BlobServiceClient("UseDevelopmentStorage=true");
    }

    public static async Task<StorageClient> GetStorageClientUsingAzurite()
    {
        var blobServiceClient = await GetBlobServiceClientUsingAzurite();
        return new StorageClient(blobServiceClient);
    }

    public static async Task EnsureStopped()
    {
        if (instance != null)
        {
            await instance.Stop();
            instance = null;
        }
    }
}