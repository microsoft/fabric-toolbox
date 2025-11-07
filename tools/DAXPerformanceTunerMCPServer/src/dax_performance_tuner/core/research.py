"""Research helpers that surface relevant DAX optimization articles.

ATTRIBUTION & ETHICAL USE:
This module fetches content from external sources including SQLBI documentation.
All fetched content remains the property of respective copyright holders.

This tool is intended for educational and analytical purposes, providing users
with references and links to authoritative DAX optimization resources.

Users are encouraged to visit original sources for complete and up-to-date information.
See ATTRIBUTION.md in the repository root for complete attribution details.
"""

import requests
import re
import concurrent.futures
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup

# Internal imports
from ..config import (
    RESEARCH_REQUEST_TIMEOUT,
    RESEARCH_MAX_WORKERS,
    RESEARCH_MIN_CONTENT_LENGTH
)
from ..data.article_patterns import ARTICLE_PATTERNS


def analyze_query_patterns(query: str) -> tuple[List[str], Dict[str, List[Dict[str, str]]]]:
    if not query or not query.strip():
        return [], {}

    relevant_articles = []
    pattern_matches = {}

    for article_id, config in ARTICLE_PATTERNS.items():
        patterns = config.get("patterns", [])

        if not patterns:
            relevant_articles.append(article_id)
            continue

        article_matches = []
        for pattern in patterns:
            try:
                for match in re.finditer(pattern, query, re.IGNORECASE | re.DOTALL):
                    start_pos = max(0, match.start() - 50)
                    end_pos = min(len(query), match.end() + 50)
                    article_matches.append({
                        "matched_text": match.group(0).strip(),
                        "context": query[start_pos:end_pos].strip()
                    })
            except re.error:
                continue
                
        if article_matches:
            relevant_articles.append(article_id)
            pattern_matches[article_id] = article_matches

    return relevant_articles, pattern_matches


def fetch_single_article(url: str) -> Optional[Dict[str, Any]]:
    try:
        response = requests.get(url, timeout=RESEARCH_REQUEST_TIMEOUT)
        if response.status_code != 200:
            return None

        soup = BeautifulSoup(response.content, 'html.parser')
        title_tag = soup.find('title')
        title = title_tag.get_text(strip=True) if title_tag else None

        for unwanted in soup.find_all(['script', 'style', 'nav', 'header', 'footer', 'aside']):
            unwanted.decompose()

        content = re.sub(r'\s+', ' ', soup.get_text(separator=' ', strip=True))

        if len(content) < RESEARCH_MIN_CONTENT_LENGTH:
            return None

        return {"url": url, "title": title, "content": content}

    except Exception:
        return None


def fetch_articles_concurrent(requests: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    articles: List[Dict[str, Any]] = []

    if not requests:
        return articles

    max_workers = min(len(requests), RESEARCH_MAX_WORKERS)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_request = {
            executor.submit(fetch_single_article, request["url"]): request
            for request in requests
            if "url" in request and request["url"]
        }

        for future in concurrent.futures.as_completed(future_to_request):
            request = future_to_request[future]
            result = future.result()
            if not result:
                continue

            result.setdefault("url", request.get("url"))
            if "id" in request:
                result["id"] = request["id"]
            if request.get("title") and not result.get("title"):
                result["title"] = request["title"]

            articles.append(result)

    return articles

def get_dax_research_core(target_query: str) -> Dict[str, Any]:
    if not target_query or not target_query.strip():
        return {
            "status": "error",
            "error": "target_query is required. Provide a DAX query to analyze for optimization patterns."
        }
    
    try:
        relevant_article_ids, pattern_matches = analyze_query_patterns(target_query)

        article_results: Dict[str, Dict[str, Any]] = {}
        remote_requests: List[Dict[str, Any]] = []

        for aid in relevant_article_ids:
            cfg = ARTICLE_PATTERNS.get(aid, {})
            title = cfg.get("title", aid)
            url = cfg.get("url")
            fallback_content = cfg.get("content", "")

            entry: Dict[str, Any] = {
                "id": aid,
                "title": title,
                "url": url,
                "content": fallback_content,
                "matched_patterns": pattern_matches.get(aid, [])
            }

            if url:
                remote_requests.append({
                    "id": aid,
                    "url": url,
                    "title": title
                })

            article_results[aid] = entry

        fetched_articles = fetch_articles_concurrent(remote_requests) if remote_requests else []

        for fetched in fetched_articles:
            aid = fetched.get("id")
            if aid and aid in article_results:
                entry = article_results[aid]
                entry["url"] = fetched.get("url", entry.get("url"))
                entry["content"] = fetched.get("content", entry["content"])
                if fetched.get("title"):
                    entry["title"] = fetched["title"]

        articles_out = [article_results[aid] for aid in relevant_article_ids if aid in article_results]
        
        return {
            "status": "success",
            "total_articles": len(articles_out),
            "articles": articles_out
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": f"Failed to retrieve DAX research articles: {str(e)}"
        }


