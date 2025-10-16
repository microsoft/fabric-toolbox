"""
DAX Performance Tuner - Data Module

Contains DAX optimization pattern definitions and research article configurations.

This module houses:
- article_patterns.py: 100+ DAX anti-pattern definitions including custom guidance (CUST000-CUST002) and knowledge base patterns

All patterns are used by the research system for intelligent optimization guidance.
"""

from .article_patterns import ARTICLE_PATTERNS

__all__ = ['ARTICLE_PATTERNS']