using GenericMirroring;
using Microsoft.Identity.Client;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SQLMirroring
{
    public static class Upload
    {
        public static void CopyChangesToOnelake(Root config, string FiletoCopy, string justFile)
        {
            foreach (UploadDetails upd in config.uploadDetails)
            { 
            // this is a cheat, I could not get the rest api to work, copying files to onelake, so I fell back to using AZCOPY
            string randomfilename = Path.GetRandomFileName();
            //var ps1File = @"C:\temp\di\OpenMirroring\ExcelDemo\./copy_files_tmp.ps1";
            var ps1File = $"{upd.PathtoAZCopy}\\{randomfilename}.ps1";

            StringBuilder psScript = new StringBuilder();
            psScript.AppendLine($"$env:AZCOPY_AUTO_LOGIN_TYPE = \"SPN\";\r\n");
            psScript.AppendLine($"$env:AZCOPY_SPA_APPLICATION_ID = \"{upd.SPN_Application_ID}\";\r\n");
            psScript.AppendLine($"$env:AZCOPY_SPA_CLIENT_SECRET = \"{upd.SPN_Secret}\";\r\n");
            psScript.AppendLine($"$env:AZCOPY_TENANT_ID = \"{upd.SPN_Tenant}\";\r\n");
            psScript.AppendLine($"$env:AZCOPY_PATH = \"{upd.PathtoAZCopy}\"");
            psScript.AppendLine($"{upd.PathtoAZCopy}azcopy.exe copy \"{FiletoCopy}\" \"{upd.LandingZone.Replace(".dfs.", ".blob.")}/{justFile}\" --overwrite=true --from-to=LocalBlob --blob-type Detect --follow-symlinks --check-length=true --put-md5 --follow-symlinks --disable-auto-decoding=false  --recursive --trusted-microsoft-suffixes=onelake.blob.fabric.microsoft.com --log-level=INFO;\r\n");

            File.WriteAllText(ps1File, psScript.ToString());
            Thread.Sleep(1000);
            var startInfo = new ProcessStartInfo()
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy ByPass -File \"{ps1File}\"",
                UseShellExecute = false
            };

            Thread.Sleep(1000);
            Process.Start(startInfo);
            Thread.Sleep(1000);
            File.Delete(ps1File);


            }
        }
        public static void RemoveChangesToOnelake(Root config, string justFile)
        {

            // this is a cheat, I could not get the rest api to work, copying files to onelake, so I fell back to using AZCOPY
            foreach (UploadDetails upd in config.uploadDetails)
            {
                try
                {
                    //var ps1File = @"C:\temp\di\OpenMirroring\ExcelDemo\./copy_files_tmp.ps1";
                    string randomfilename = Path.GetRandomFileName();
                    //var ps1File = @"C:\temp\di\OpenMirroring\ExcelDemo\./copy_files_tmp.ps1";
                    var ps1File = $"{upd.PathtoAZCopy}\\{randomfilename}.ps1";

                    StringBuilder psScript = new StringBuilder();
                    psScript.AppendLine($"$env:AZCOPY_AUTO_LOGIN_TYPE = \"SPN\";\r\n");
                    psScript.AppendLine($"$env:AZCOPY_SPA_APPLICATION_ID = \"{upd.SPN_Application_ID}\";\r\n");
                    psScript.AppendLine($"$env:AZCOPY_SPA_CLIENT_SECRET = \"{upd.SPN_Secret}\";\r\n");
                    psScript.AppendLine($"$env:AZCOPY_TENANT_ID = \"{upd.SPN_Tenant}\";\r\n");
                    psScript.AppendLine($"$env:AZCOPY_PATH = \"{upd.PathtoAZCopy}\"");
                    psScript.AppendLine($"{upd.PathtoAZCopy}azcopy.exe remove  \"{upd.LandingZone.Replace(".dfs.", ".dfs.")}/{justFile}\" --from-to=BlobFSTrash --recursive --trusted-microsoft-suffixes=onelake.dfs.fabric.microsoft.com --log-level=INFO;\r\n");

                    File.WriteAllText(ps1File, psScript.ToString());

                    Thread.Sleep(1500);

                    var startInfo = new ProcessStartInfo()
                    {
                        FileName = "powershell.exe",
                        Arguments = $"-NoProfile -ExecutionPolicy ByPass -File \"{ps1File}\"",
                        UseShellExecute = false
                    };

                    Thread.Sleep(1500);
                    Process.Start(startInfo);
                    Thread.Sleep(1500);

                    try
                    {
                        Thread.Sleep(500);
                        File.Delete(ps1File);
                    }
                    catch (Exception ex)
                    {
                        // Dont worry about this erroring, it means the folder doesnt exist
                        Logging.Log("Error in RemoveChangesToOnelake Removing file:{0}", ex.Message);
                    }
                }
                catch (Exception ex)
                {
                    // Dont worry about this erroring, it means the folder doesnt exist
                    Logging.Log("Error in RemoveChangesToOnelake:{0}", ex.Message);
                }
            }
        }

    }
}
