using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gen2toFabricDW
{
    public static class Logging
    {
        public static string locallogging = string.Empty;
        public static void Log(string message, string logLevel = "INFO")
        {
            string logMessage = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{logLevel}] {message}";
            Console.WriteLine(logMessage);
            try
            {
                File.AppendAllText(locallogging, logMessage + Environment.NewLine);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to write log: {ex.Message}");
            }
        }

    }
}
