using System.Text.Json;
using System.Text.RegularExpressions;
using DaxPerformanceTuner.Library.Contracts;
using DaxPerformanceTuner.Library.Data;
using HtmlAgilityPack;

namespace DaxPerformanceTuner.Library.Core;

/// <summary>
/// Research service that fetches DAX optimization guidance.
/// Pattern-matched article detection plus concurrent HTTP article fetching.
/// Uses ArticlePatterns for the full article registry.
/// </summary>
public class ResearchService
{
    private readonly HttpClient _httpClient;
    private readonly int _requestTimeout;
    private readonly int _minContentLength;

    public ResearchService(HttpClient httpClient, DaxPerformanceTunerConfig config)
    {
        _httpClient = httpClient;
        _requestTimeout = config.ResearchRequestTimeout;
        _minContentLength = config.ResearchMinContentLength;
    }

    // ---- public API ----

    public async Task<Dictionary<string, object>> GetDaxResearchAsync(string targetQuery)
    {
        if (string.IsNullOrWhiteSpace(targetQuery))
            return new Dictionary<string, object> { ["status"] = "error", ["error"] = "target_query is required." };

        try
        {
            var (relevantIds, patternMatches) = AnalyzeQueryPatterns(targetQuery);

            // Build initial article entries
            var articleResults = new Dictionary<string, Dictionary<string, object>>();
            var fetchRequests = new List<(string Id, string Url)>();

            foreach (var id in relevantIds)
            {
                if (!ArticlePatterns.Articles.TryGetValue(id, out var cfg)) continue;

                articleResults[id] = new Dictionary<string, object>
                {
                    ["id"] = id,
                    ["title"] = cfg.Title,
                    ["url"] = cfg.Url ?? "",
                    ["content"] = cfg.Content ?? "",
                    ["matched_patterns"] = patternMatches.TryGetValue(id, out var mp) ? mp : new List<Dictionary<string, string>>()
                };

                if (!string.IsNullOrEmpty(cfg.Url))
                    fetchRequests.Add((id, cfg.Url));
            }

            // Fetch articles concurrently
            if (fetchRequests.Count > 0)
            {
                var fetchTasks = fetchRequests.Select(async req =>
                {
                    var fetched = await FetchArticleAsync(req.Url);
                    return (req.Id, fetched);
                });

                var results = await Task.WhenAll(fetchTasks);
                foreach (var (id, fetched) in results)
                {
                    if (fetched != null && articleResults.TryGetValue(id, out var entry))
                    {
                        entry["content"] = fetched.GetValueOrDefault("content") ?? entry["content"];
                        if (fetched.TryGetValue("title", out var ft) && !string.IsNullOrEmpty(ft?.ToString()))
                            entry["title"] = ft;
                    }
                }
            }

            var articlesOut = relevantIds
                .Where(id => articleResults.ContainsKey(id))
                .Select(id => articleResults[id])
                .ToList();

            return new Dictionary<string, object>
            {
                ["status"] = "success",
                ["total_articles"] = articlesOut.Count,
                ["articles"] = articlesOut
            };
        }
        catch (Exception ex)
        {
            return new Dictionary<string, object>
            {
                ["status"] = "error",
                ["error"] = $"Failed to retrieve DAX research articles: {ex.Message}"
            };
        }
    }

    // ---- pattern matching ----

    private static (List<string> RelevantIds, Dictionary<string, List<Dictionary<string, string>>> PatternMatches)
        AnalyzeQueryPatterns(string query)
    {
        var relevantIds = new List<string>();
        var patternMatches = new Dictionary<string, List<Dictionary<string, string>>>();

        foreach (var (id, cfg) in ArticlePatterns.Articles)
        {
            if (cfg.Patterns.Length == 0)
            {
                // Always include (e.g. CUST000, STATIC_SQLBI_*)
                relevantIds.Add(id);
                continue;
            }

            var matches = new List<Dictionary<string, string>>();
            foreach (var pattern in cfg.Patterns)
            {
                try
                {
                    foreach (Match m in Regex.Matches(query, pattern, RegexOptions.IgnoreCase | RegexOptions.Singleline))
                    {
                        var start = Math.Max(0, m.Index - 50);
                        var end = Math.Min(query.Length, m.Index + m.Length + 50);
                        matches.Add(new Dictionary<string, string>
                        {
                            ["matched_text"] = m.Value.Trim(),
                            ["context"] = query[start..end].Trim()
                        });
                    }
                }
                catch { }
            }

            if (matches.Count > 0)
            {
                relevantIds.Add(id);
                patternMatches[id] = matches;
            }
        }

        return (relevantIds, patternMatches);
    }

    // ---- HTTP fetch ----

    private async Task<Dictionary<string, string>?> FetchArticleAsync(string url)
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(_requestTimeout));
            var response = await _httpClient.GetAsync(url, cts.Token);
            if (!response.IsSuccessStatusCode) return null;

            var html = await response.Content.ReadAsStringAsync(cts.Token);
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var title = doc.DocumentNode.SelectSingleNode("//title")?.InnerText.Trim();

            // Remove unwanted tags
            foreach (var node in doc.DocumentNode.SelectNodes("//script|//style|//nav|//header|//footer|//aside") ?? Enumerable.Empty<HtmlNode>())
                node.Remove();

            var content = Regex.Replace(doc.DocumentNode.InnerText, @"\s+", " ").Trim();
            if (content.Length < _minContentLength) return null;

            return new Dictionary<string, string>
            {
                ["url"] = url,
                ["title"] = title ?? "",
                ["content"] = content
            };
        }
        catch { return null; }
    }
}
