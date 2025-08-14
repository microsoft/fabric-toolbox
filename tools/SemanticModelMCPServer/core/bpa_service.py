"""
Best Practice Analyzer integration for the Semantic Model MCP Server
"""

import os
import json
from typing import Dict, List, Any, Optional
from .bpa_analyzer import BPAAnalyzer, BPAViolation, BPASeverity

class BPAService:
    """Service class for integrating BPA functionality into the MCP server"""
    
    def __init__(self, server_directory: str):
        """
        Initialize the BPA service
        
        Args:
            server_directory: The root directory of the MCP server
        """
        self.server_directory = server_directory
        self.rules_file = os.path.join(server_directory, "core", "bpa.json")
        self.analyzer = None
        
        # Initialize the analyzer if rules file exists
        if os.path.exists(self.rules_file):
            self.analyzer = BPAAnalyzer(self.rules_file)
    
    def analyze_model_from_tmsl(self, tmsl_definition: str) -> Dict[str, Any]:
        """
        Analyze a TMSL model and return BPA violations
        
        Args:
            tmsl_definition: TMSL JSON string
            
        Returns:
            Dictionary containing analysis results
        """
        if not self.analyzer:
            return {
                'error': 'BPA rules not loaded. Please check if bpa.json exists.',
                'violations': [],
                'summary': {}
            }
        
        try:
            # Preprocess TMSL definition to handle formatting issues
            cleaned_tmsl = self._clean_tmsl_json(tmsl_definition)
            
            # Parse TMSL
            tmsl_model = json.loads(cleaned_tmsl)
            
            # Run analysis
            violations = self.analyzer.analyze_model(tmsl_model)
            
            # Get summary
            summary = self.analyzer.get_violations_summary()
            
            # Export violations
            violations_dict = self.analyzer.export_violations_to_dict()
            
            return {
                'success': True,
                'violations': violations_dict,
                'summary': summary,
                'rules_count': len(self.analyzer.rules),
                'analysis_complete': True
            }
            
        except json.JSONDecodeError as e:
            return {
                'error': f'Invalid TMSL JSON: {str(e)}',
                'violations': [],
                'summary': {}
            }
        except Exception as e:
            return {
                'error': f'Analysis failed: {str(e)}',
                'violations': [],
                'summary': {}
            }
    
    def get_violations_by_severity(self, severity_name: str) -> List[Dict[str, Any]]:
        """Get violations filtered by severity level"""
        if not self.analyzer:
            return []
        
        try:
            severity = BPASeverity[severity_name.upper()]
            violations = self.analyzer.get_violations_by_severity(severity)
            return [
                {
                    'rule_id': v.rule_id,
                    'rule_name': v.rule_name,
                    'category': v.category,
                    'object_type': v.object_type,
                    'object_name': v.object_name,
                    'table_name': v.table_name,
                    'description': v.description,
                    'fix_expression': v.fix_expression
                }
                for v in violations
            ]
        except KeyError:
            return []
    
    def get_violations_by_category(self, category: str) -> List[Dict[str, Any]]:
        """Get violations filtered by category"""
        if not self.analyzer:
            return []
        
        violations = self.analyzer.get_violations_by_category(category)
        return [
            {
                'rule_id': v.rule_id,
                'rule_name': v.rule_name,
                'severity': v.severity.name,
                'object_type': v.object_type,
                'object_name': v.object_name,
                'table_name': v.table_name,
                'description': v.description,
                'fix_expression': v.fix_expression
            }
            for v in violations
        ]
    
    def get_available_categories(self) -> List[str]:
        """Get list of available BPA rule categories"""
        if not self.analyzer:
            return []
        
        categories = set()
        for rule in self.analyzer.rules:
            categories.add(rule.category)
        
        return sorted(list(categories))
    
    def get_available_severities(self) -> List[Dict[str, Any]]:
        """Get list of available severity levels"""
        return [
            {'name': 'INFO', 'level': 1, 'description': 'Informational - suggestions for improvement'},
            {'name': 'WARNING', 'level': 2, 'description': 'Warning - potential issues that should be addressed'},
            {'name': 'ERROR', 'level': 3, 'description': 'Error - critical issues that should be fixed immediately'}
        ]
    
    def get_rules_summary(self) -> Dict[str, Any]:
        """Get summary of loaded BPA rules"""
        if not self.analyzer:
            return {
                'error': 'BPA rules not loaded',
                'total_rules': 0,
                'categories': [],
                'severities': []
            }
        
        categories = {}
        severities = {}
        
        for rule in self.analyzer.rules:
            # Count by category
            categories[rule.category] = categories.get(rule.category, 0) + 1
            
            # Count by severity
            severity_name = rule.severity.name
            severities[severity_name] = severities.get(severity_name, 0) + 1
        
        return {
            'total_rules': len(self.analyzer.rules),
            'categories': categories,
            'severities': severities,
            'rules_file': self.rules_file
        }
    
    def format_violations_for_display(self, violations: List[Dict[str, Any]], 
                                    group_by: str = 'category') -> Dict[str, Any]:
        """
        Format violations for display, grouped by category or severity
        
        Args:
            violations: List of violation dictionaries
            group_by: How to group violations ('category', 'severity', 'object_type')
            
        Returns:
            Formatted violations grouped for display
        """
        if not violations:
            return {'groups': {}, 'total': 0}
        
        groups = {}
        
        for violation in violations:
            group_key = violation.get(group_by, 'Unknown')
            
            if group_key not in groups:
                groups[group_key] = {
                    'violations': [],
                    'count': 0
                }
            
            groups[group_key]['violations'].append(violation)
            groups[group_key]['count'] += 1
        
        # Sort groups by count (descending)
        sorted_groups = dict(sorted(groups.items(), 
                                  key=lambda x: x[1]['count'], 
                                  reverse=True))
        
        return {
            'groups': sorted_groups,
            'total': len(violations),
            'group_by': group_by
        }
    
    def generate_bpa_report(self, tmsl_definition: str, 
                          format_type: str = 'summary') -> Dict[str, Any]:
        """
        Generate a comprehensive BPA report
        
        Args:
            tmsl_definition: TMSL JSON string
            format_type: Type of report ('summary', 'detailed', 'by_category')
            
        Returns:
            Formatted BPA report
        """
        analysis_result = self.analyze_model_from_tmsl(tmsl_definition)
        
        if not analysis_result.get('success'):
            return analysis_result
        
        violations = analysis_result['violations']
        summary = analysis_result['summary']
        
        report = {
            'analysis_summary': summary,
            'rules_applied': analysis_result['rules_count'],
            'timestamp': json.dumps(None),  # Would use datetime in real implementation
            'format_type': format_type
        }
        
        if format_type == 'summary':
            report['violations_by_severity'] = {
                'ERROR': [v for v in violations if v['severity'] == 'ERROR'],
                'WARNING': [v for v in violations if v['severity'] == 'WARNING'],  
                'INFO': [v for v in violations if v['severity'] == 'INFO']
            }
            
        elif format_type == 'detailed':
            report['all_violations'] = violations
            
        elif format_type == 'by_category':
            categories = {}
            for violation in violations:
                category = violation['category']
                if category not in categories:
                    categories[category] = []
                categories[category].append(violation)
            
            report['violations_by_category'] = categories
        
        return report
    
    def _clean_tmsl_json(self, tmsl_definition: str) -> str:
        """
        Clean and preprocess TMSL JSON string to handle common formatting issues
        
        Args:
            tmsl_definition: Raw TMSL JSON string
            
        Returns:
            Cleaned JSON string ready for parsing
        """
        # Remove carriage returns and normalize line endings
        cleaned = tmsl_definition.replace('\r\n', '\n').replace('\r', '\n')
        
        # Remove any leading/trailing whitespace
        cleaned = cleaned.strip()
        
        # If the string is already valid JSON, try parsing it first
        try:
            # Test if it's already valid JSON
            json.loads(cleaned)
            return cleaned
        except json.JSONDecodeError:
            # If not valid, try additional cleaning steps
            pass
        
        # Handle common issues with escaped JSON strings
        # If the string starts and ends with quotes, it might be a JSON string containing JSON
        if cleaned.startswith('"') and cleaned.endswith('"'):
            try:
                # Try to decode it as a JSON string
                decoded = json.loads(cleaned)
                if isinstance(decoded, str):
                    # If successful and result is a string, use that as the TMSL
                    cleaned = decoded
            except json.JSONDecodeError:
                # If that fails, remove the outer quotes manually
                cleaned = cleaned[1:-1]
        
        # Handle escaped quotes and backslashes
        cleaned = cleaned.replace('\\"', '"').replace('\\\\', '\\')
        
        # Handle escaped newlines in JSON strings
        cleaned = cleaned.replace('\\n', '\n').replace('\\t', '\t')
        
        return cleaned
