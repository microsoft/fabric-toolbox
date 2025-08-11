"""
Best Practice Analyzer for Semantic Models
Analyzes TMSL models against a comprehensive set of best practice rules
"""

import json
import re
from typing import Dict, List, Any, Optional, Union
from dataclasses import dataclass
from enum import IntEnum
import logging

logger = logging.getLogger(__name__)

class BPASeverity(IntEnum):
    """BPA Rule Severity Levels"""
    INFO = 1
    WARNING = 2
    ERROR = 3

@dataclass
class BPAViolation:
    """Represents a Best Practice Analyzer rule violation"""
    rule_id: str
    rule_name: str
    category: str
    severity: BPASeverity
    description: str
    object_type: str
    object_name: str
    table_name: Optional[str] = None
    fix_expression: Optional[str] = None
    details: Optional[str] = None

@dataclass
class BPARule:
    """Represents a Best Practice Analyzer rule"""
    id: str
    name: str
    category: str
    description: str
    severity: BPASeverity
    scope: List[str]
    expression: str
    fix_expression: Optional[str] = None
    compatibility_level: int = 1200

class BPAAnalyzer:
    """
    Best Practice Analyzer for Semantic Models
    Analyzes TMSL models against best practice rules
    """
    
    def __init__(self, rules_file_path: str = None):
        """
        Initialize the BPA Analyzer
        
        Args:
            rules_file_path: Path to the BPA rules JSON file
        """
        self.rules: List[BPARule] = []
        self.violations: List[BPAViolation] = []
        
        if rules_file_path:
            self.load_rules(rules_file_path)
    
    def load_rules(self, rules_file_path: str) -> None:
        """Load BPA rules from JSON file"""
        try:
            with open(rules_file_path, 'r', encoding='utf-8') as f:
                rules_data = json.load(f)
            
            self.rules = []
            for rule_data in rules_data.get('rules', []):
                rule = BPARule(
                    id=rule_data.get('ID', ''),
                    name=rule_data.get('Name', ''),
                    category=rule_data.get('Category', ''),
                    description=rule_data.get('Description', ''),
                    severity=BPASeverity(rule_data.get('Severity', 1)),
                    scope=rule_data.get('Scope', '').split(', '),
                    expression=rule_data.get('Expression', ''),
                    fix_expression=rule_data.get('FixExpression'),
                    compatibility_level=rule_data.get('CompatibilityLevel', 1200)
                )
                self.rules.append(rule)
                
            logger.info(f"Loaded {len(self.rules)} BPA rules")
            
        except Exception as e:
            logger.error(f"Error loading BPA rules: {str(e)}")
            raise

    def analyze_model(self, tmsl_json: Union[str, Dict]) -> List[BPAViolation]:
        """
        Analyze a TMSL model against all loaded BPA rules
        
        Args:
            tmsl_json: TMSL model as JSON string or dictionary
            
        Returns:
            List of BPA violations found
        """
        if isinstance(tmsl_json, str):
            tmsl_model = json.loads(tmsl_json)
        else:
            tmsl_model = tmsl_json
            
        self.violations = []
        
        # Get the model object
        model = tmsl_model.get('create', {}).get('database', {}).get('model', {})
        if not model:
            # Try alternative structure
            model = tmsl_model.get('model', {})
        
        if not model:
            logger.warning("No model found in TMSL structure")
            return self.violations
        
        # Analyze each rule
        for rule in self.rules:
            try:
                self._analyze_rule(rule, model)
            except Exception as e:
                logger.error(f"Error analyzing rule {rule.id}: {str(e)}")
                continue
        
        return self.violations
    
    def _analyze_rule(self, rule: BPARule, model: Dict) -> None:
        """Analyze a single rule against the model"""
        
        # Check each scope type that the rule applies to
        for scope in rule.scope:
            scope = scope.strip()
            
            if scope == "Model":
                self._check_model_rule(rule, model)
            elif scope == "Table":
                self._check_table_rule(rule, model, "Table")
            elif scope == "CalculatedTable":
                self._check_table_rule(rule, model, "CalculatedTable")
            elif scope in ["DataColumn", "CalculatedColumn", "CalculatedTableColumn"]:
                self._check_column_rule(rule, model, scope)
            elif scope == "Measure":
                self._check_measure_rule(rule, model)
            elif scope == "Relationship":
                self._check_relationship_rule(rule, model)
            elif scope == "Partition":
                self._check_partition_rule(rule, model)
            elif scope == "Hierarchy":
                self._check_hierarchy_rule(rule, model)
            elif scope == "Perspective":
                self._check_perspective_rule(rule, model)
            elif scope == "CalculationGroup":
                self._check_calculation_group_rule(rule, model)
            elif scope == "CalculationItem":
                self._check_calculation_item_rule(rule, model)
            elif scope == "KPI":
                self._check_kpi_rule(rule, model)
            elif scope == "TablePermission":
                self._check_table_permission_rule(rule, model)

    def _check_model_rule(self, rule: BPARule, model: Dict) -> None:
        """Check rules that apply to the entire model"""
        try:
            if self._evaluate_expression_for_model(rule.expression, model):
                violation = BPAViolation(
                    rule_id=rule.id,
                    rule_name=rule.name,
                    category=rule.category,
                    severity=rule.severity,
                    description=rule.description,
                    object_type="Model",
                    object_name=model.get('name', 'Model'),
                    fix_expression=rule.fix_expression
                )
                self.violations.append(violation)
        except Exception as e:
            logger.debug(f"Error evaluating model rule {rule.id}: {str(e)}")

    def _check_table_rule(self, rule: BPARule, model: Dict, table_type: str) -> None:
        """Check rules that apply to tables"""
        tables = model.get('tables', [])
        
        for table in tables:
            # Filter by table type if specified
            if table_type == "CalculatedTable" and not table.get('partitions', [{}])[0].get('source', {}).get('type') == 'calculated':
                continue
            elif table_type == "Table" and table.get('partitions', [{}])[0].get('source', {}).get('type') == 'calculated':
                continue
                
            try:
                if self._evaluate_expression_for_table(rule.expression, table, model):
                    violation = BPAViolation(
                        rule_id=rule.id,
                        rule_name=rule.name,
                        category=rule.category,
                        severity=rule.severity,
                        description=rule.description,
                        object_type=table_type,
                        object_name=table.get('name', ''),
                        fix_expression=rule.fix_expression
                    )
                    self.violations.append(violation)
            except Exception as e:
                logger.debug(f"Error evaluating table rule {rule.id} for table {table.get('name', '')}: {str(e)}")

    def _check_column_rule(self, rule: BPARule, model: Dict, column_type: str) -> None:
        """Check rules that apply to columns"""
        tables = model.get('tables', [])
        
        for table in tables:
            columns = table.get('columns', [])
            
            for column in columns:
                # Filter by column type
                col_type = column.get('type', 'data')
                if column_type == "CalculatedColumn" and col_type != 'calculated':
                    continue
                elif column_type == "DataColumn" and col_type == 'calculated':
                    continue
                elif column_type == "CalculatedTableColumn":
                    # Check if this is a calculated table
                    if not table.get('partitions', [{}])[0].get('source', {}).get('type') == 'calculated':
                        continue
                        
                try:
                    if self._evaluate_expression_for_column(rule.expression, column, table, model):
                        violation = BPAViolation(
                            rule_id=rule.id,
                            rule_name=rule.name,
                            category=rule.category,
                            severity=rule.severity,
                            description=rule.description,
                            object_type=column_type,
                            object_name=column.get('name', ''),
                            table_name=table.get('name', ''),
                            fix_expression=rule.fix_expression
                        )
                        self.violations.append(violation)
                except Exception as e:
                    logger.debug(f"Error evaluating column rule {rule.id} for column {column.get('name', '')} in table {table.get('name', '')}: {str(e)}")

    def _check_measure_rule(self, rule: BPARule, model: Dict) -> None:
        """Check rules that apply to measures"""
        tables = model.get('tables', [])
        
        for table in tables:
            measures = table.get('measures', [])
            
            for measure in measures:
                try:
                    if self._evaluate_expression_for_measure(rule.expression, measure, table, model):
                        violation = BPAViolation(
                            rule_id=rule.id,
                            rule_name=rule.name,
                            category=rule.category,
                            severity=rule.severity,
                            description=rule.description,
                            object_type="Measure",
                            object_name=measure.get('name', ''),
                            table_name=table.get('name', ''),
                            fix_expression=rule.fix_expression
                        )
                        self.violations.append(violation)
                except Exception as e:
                    logger.debug(f"Error evaluating measure rule {rule.id} for measure {measure.get('name', '')} in table {table.get('name', '')}: {str(e)}")

    def _check_relationship_rule(self, rule: BPARule, model: Dict) -> None:
        """Check rules that apply to relationships"""
        relationships = model.get('relationships', [])
        
        for relationship in relationships:
            try:
                if self._evaluate_expression_for_relationship(rule.expression, relationship, model):
                    from_table = relationship.get('fromTable', '')
                    to_table = relationship.get('toTable', '')
                    
                    violation = BPAViolation(
                        rule_id=rule.id,
                        rule_name=rule.name,
                        category=rule.category,
                        severity=rule.severity,
                        description=rule.description,
                        object_type="Relationship",
                        object_name=f"{from_table} -> {to_table}",
                        fix_expression=rule.fix_expression,
                        details=f"From: {from_table}[{relationship.get('fromColumn', '')}] To: {to_table}[{relationship.get('toColumn', '')}]"
                    )
                    self.violations.append(violation)
            except Exception as e:
                logger.debug(f"Error evaluating relationship rule {rule.id}: {str(e)}")

    def _check_partition_rule(self, rule: BPARule, model: Dict) -> None:
        """Check rules that apply to partitions"""
        tables = model.get('tables', [])
        
        for table in tables:
            partitions = table.get('partitions', [])
            
            for partition in partitions:
                try:
                    if self._evaluate_expression_for_partition(rule.expression, partition, table, model):
                        violation = BPAViolation(
                            rule_id=rule.id,
                            rule_name=rule.name,
                            category=rule.category,
                            severity=rule.severity,
                            description=rule.description,
                            object_type="Partition",
                            object_name=partition.get('name', ''),
                            table_name=table.get('name', ''),
                            fix_expression=rule.fix_expression
                        )
                        self.violations.append(violation)
                except Exception as e:
                    logger.debug(f"Error evaluating partition rule {rule.id} for partition {partition.get('name', '')} in table {table.get('name', '')}: {str(e)}")

    def _check_hierarchy_rule(self, rule: BPARule, model: Dict) -> None:
        """Check rules that apply to hierarchies"""
        tables = model.get('tables', [])
        
        for table in tables:
            hierarchies = table.get('hierarchies', [])
            
            for hierarchy in hierarchies:
                try:
                    if self._evaluate_expression_for_hierarchy(rule.expression, hierarchy, table, model):
                        violation = BPAViolation(
                            rule_id=rule.id,
                            rule_name=rule.name,
                            category=rule.category,
                            severity=rule.severity,
                            description=rule.description,
                            object_type="Hierarchy",
                            object_name=hierarchy.get('name', ''),
                            table_name=table.get('name', ''),
                            fix_expression=rule.fix_expression
                        )
                        self.violations.append(violation)
                except Exception as e:
                    logger.debug(f"Error evaluating hierarchy rule {rule.id} for hierarchy {hierarchy.get('name', '')} in table {table.get('name', '')}: {str(e)}")

    def _check_perspective_rule(self, rule: BPARule, model: Dict) -> None:
        """Check rules that apply to perspectives"""
        perspectives = model.get('perspectives', [])
        
        for perspective in perspectives:
            try:
                if self._evaluate_expression_for_perspective(rule.expression, perspective, model):
                    violation = BPAViolation(
                        rule_id=rule.id,
                        rule_name=rule.name,
                        category=rule.category,
                        severity=rule.severity,
                        description=rule.description,
                        object_type="Perspective",
                        object_name=perspective.get('name', ''),
                        fix_expression=rule.fix_expression
                    )
                    self.violations.append(violation)
            except Exception as e:
                logger.debug(f"Error evaluating perspective rule {rule.id} for perspective {perspective.get('name', '')}: {str(e)}")

    def _check_calculation_group_rule(self, rule: BPARule, model: Dict) -> None:
        """Check rules that apply to calculation groups"""
        tables = model.get('tables', [])
        
        for table in tables:
            # Check if this is a calculation group table
            if table.get('calculationGroup'):
                try:
                    if self._evaluate_expression_for_calculation_group(rule.expression, table, model):
                        violation = BPAViolation(
                            rule_id=rule.id,
                            rule_name=rule.name,
                            category=rule.category,
                            severity=rule.severity,
                            description=rule.description,
                            object_type="CalculationGroup",
                            object_name=table.get('name', ''),
                            fix_expression=rule.fix_expression
                        )
                        self.violations.append(violation)
                except Exception as e:
                    logger.debug(f"Error evaluating calculation group rule {rule.id} for table {table.get('name', '')}: {str(e)}")

    def _check_calculation_item_rule(self, rule: BPARule, model: Dict) -> None:
        """Check rules that apply to calculation items"""
        tables = model.get('tables', [])
        
        for table in tables:
            calc_group = table.get('calculationGroup')
            if calc_group:
                calc_items = calc_group.get('calculationItems', [])
                
                for calc_item in calc_items:
                    try:
                        if self._evaluate_expression_for_calculation_item(rule.expression, calc_item, table, model):
                            violation = BPAViolation(
                                rule_id=rule.id,
                                rule_name=rule.name,
                                category=rule.category,
                                severity=rule.severity,
                                description=rule.description,
                                object_type="CalculationItem",
                                object_name=calc_item.get('name', ''),
                                table_name=table.get('name', ''),
                                fix_expression=rule.fix_expression
                            )
                            self.violations.append(violation)
                    except Exception as e:
                        logger.debug(f"Error evaluating calculation item rule {rule.id} for item {calc_item.get('name', '')} in table {table.get('name', '')}: {str(e)}")

    def _check_kpi_rule(self, rule: BPARule, model: Dict) -> None:
        """Check rules that apply to KPIs"""
        tables = model.get('tables', [])
        
        for table in tables:
            measures = table.get('measures', [])
            
            for measure in measures:
                kpi = measure.get('kpi')
                if kpi:
                    try:
                        if self._evaluate_expression_for_kpi(rule.expression, kpi, measure, table, model):
                            violation = BPAViolation(
                                rule_id=rule.id,
                                rule_name=rule.name,
                                category=rule.category,
                                severity=rule.severity,
                                description=rule.description,
                                object_type="KPI",
                                object_name=measure.get('name', ''),
                                table_name=table.get('name', ''),
                                fix_expression=rule.fix_expression
                            )
                            self.violations.append(violation)
                    except Exception as e:
                        logger.debug(f"Error evaluating KPI rule {rule.id} for KPI {measure.get('name', '')} in table {table.get('name', '')}: {str(e)}")

    def _check_table_permission_rule(self, rule: BPARule, model: Dict) -> None:
        """Check rules that apply to table permissions (RLS)"""
        roles = model.get('roles', [])
        
        for role in roles:
            table_permissions = role.get('tablePermissions', [])
            
            for permission in table_permissions:
                try:
                    if self._evaluate_expression_for_table_permission(rule.expression, permission, role, model):
                        violation = BPAViolation(
                            rule_id=rule.id,
                            rule_name=rule.name,
                            category=rule.category,
                            severity=rule.severity,
                            description=rule.description,
                            object_type="TablePermission",
                            object_name=f"{role.get('name', '')}.{permission.get('table', '')}",
                            fix_expression=rule.fix_expression
                        )
                        self.violations.append(violation)
                except Exception as e:
                    logger.debug(f"Error evaluating table permission rule {rule.id}: {str(e)}")

    # Expression evaluation methods - these would need to be implemented
    # to properly parse and evaluate the rule expressions against TMSL objects
    
    def _evaluate_expression_for_model(self, expression: str, model: Dict) -> bool:
        """Evaluate rule expression for model-level rules"""
        # Simplified implementation - would need full expression parser
        return self._basic_expression_evaluation(expression, model, "model")
    
    def _evaluate_expression_for_table(self, expression: str, table: Dict, model: Dict) -> bool:
        """Evaluate rule expression for table-level rules"""
        return self._basic_expression_evaluation(expression, table, "table", model)
    
    def _evaluate_expression_for_column(self, expression: str, column: Dict, table: Dict, model: Dict) -> bool:
        """Evaluate rule expression for column-level rules"""
        return self._basic_expression_evaluation(expression, column, "column", model, table)
    
    def _evaluate_expression_for_measure(self, expression: str, measure: Dict, table: Dict, model: Dict) -> bool:
        """Evaluate rule expression for measure-level rules"""
        return self._basic_expression_evaluation(expression, measure, "measure", model, table)
    
    def _evaluate_expression_for_relationship(self, expression: str, relationship: Dict, model: Dict) -> bool:
        """Evaluate rule expression for relationship-level rules"""
        return self._basic_expression_evaluation(expression, relationship, "relationship", model)
    
    def _evaluate_expression_for_partition(self, expression: str, partition: Dict, table: Dict, model: Dict) -> bool:
        """Evaluate rule expression for partition-level rules"""
        return self._basic_expression_evaluation(expression, partition, "partition", model, table)
    
    def _evaluate_expression_for_hierarchy(self, expression: str, hierarchy: Dict, table: Dict, model: Dict) -> bool:
        """Evaluate rule expression for hierarchy-level rules"""
        return self._basic_expression_evaluation(expression, hierarchy, "hierarchy", model, table)
    
    def _evaluate_expression_for_perspective(self, expression: str, perspective: Dict, model: Dict) -> bool:
        """Evaluate rule expression for perspective-level rules"""
        return self._basic_expression_evaluation(expression, perspective, "perspective", model)
    
    def _evaluate_expression_for_calculation_group(self, expression: str, table: Dict, model: Dict) -> bool:
        """Evaluate rule expression for calculation group rules"""
        return self._basic_expression_evaluation(expression, table, "calculation_group", model)
    
    def _evaluate_expression_for_calculation_item(self, expression: str, calc_item: Dict, table: Dict, model: Dict) -> bool:
        """Evaluate rule expression for calculation item rules"""
        return self._basic_expression_evaluation(expression, calc_item, "calculation_item", model, table)
    
    def _evaluate_expression_for_kpi(self, expression: str, kpi: Dict, measure: Dict, table: Dict, model: Dict) -> bool:
        """Evaluate rule expression for KPI rules"""
        return self._basic_expression_evaluation(expression, kpi, "kpi", model, table, measure)
    
    def _evaluate_expression_for_table_permission(self, expression: str, permission: Dict, role: Dict, model: Dict) -> bool:
        """Evaluate rule expression for table permission rules"""
        return self._basic_expression_evaluation(expression, permission, "table_permission", model, None, role)

    def _basic_expression_evaluation(self, expression: str, obj: Dict, obj_type: str, 
                                   model: Dict = None, table: Dict = None, parent: Dict = None) -> bool:
        """
        Basic expression evaluation - this is a simplified implementation
        A full implementation would need a proper expression parser and evaluator
        """
        try:
            # Handle some common simple expressions
            
            # DataType checks
            if "DataType" in expression and "Double" in expression:
                return obj.get('dataType') == 'double'
            
            # Name checks
            if "Name.ToUpper().Contains" in expression:
                name = obj.get('name', '').upper()
                if "DATE" in expression:
                    return "DATE" in name
                if "CALENDAR" in expression:
                    return "CALENDAR" in name
                if "MONTH" in expression:
                    return "MONTH" in name
            
            # Hidden checks
            if "IsHidden" in expression:
                return obj.get('isHidden', False)
            
            # Format string checks
            if "FormatString" in expression:
                format_string = obj.get('formatString', '')
                if "string.IsNullOrWhitespace" in expression:
                    return not format_string or format_string.strip() == ''
                if '"mm/dd/yyyy"' in expression:
                    return format_string != "mm/dd/yyyy"
                if '"MMMM yyyy"' in expression:
                    return format_string != "MMMM yyyy"
            
            # Summarize by checks
            if "SummarizeBy" in expression and obj_type == "column":
                summarize_by = obj.get('summarizeBy', 'default')
                if '"None"' in expression:
                    return summarize_by != 'none'
            
            # Description checks
            if "string.IsNullOrWhitespace(Description)" in expression:
                description = obj.get('description', '')
                return not description or description.strip() == ''
            
            # DAX expression checks using regex
            if "RegEx.IsMatch" in expression and obj_type in ["measure", "kpi", "calculation_item"]:
                dax_expression = obj.get('expression', '')
                
                # Extract regex pattern from the rule expression
                regex_match = re.search(r'RegEx\.IsMatch\([^,]+,\s*"([^"]+)"\)', expression)
                if regex_match:
                    pattern = regex_match.group(1)
                    # Convert from .NET regex to Python regex
                    pattern = pattern.replace('(?i)', '')  # Remove case insensitive flag
                    pattern = pattern.replace('\\s*\\(', r'\s*\(')  # Fix spacing patterns
                    
                    try:
                        return bool(re.search(pattern, dax_expression, re.IGNORECASE))
                    except re.error:
                        logger.debug(f"Invalid regex pattern: {pattern}")
                        return False
            
            # Name formatting checks
            if "Name.StartsWith" in expression or "Name.EndsWith" in expression:
                name = obj.get('name', '')
                if 'StartsWith(" ")' in expression:
                    return name.startswith(' ')
                if 'EndsWith(" ")' in expression:
                    return name.endswith(' ')
                if "DateTableTemplate_" in expression:
                    return name.startswith("DateTableTemplate_")
                if "LocalDateTable_" in expression:
                    return name.startswith("LocalDateTable_")
            
            # Simple count checks
            if obj_type == "model":
                if "Tables.Any(" in expression and "DataCategory" in expression:
                    tables = model.get('tables', [])
                    for table in tables:
                        if table.get('dataCategory') == 'Time':
                            columns = table.get('columns', [])
                            for column in columns:
                                if column.get('isKey', False) and column.get('dataType') == 'dateTime':
                                    return False
                    return True
            
            # Partition count checks
            if obj_type == "table" and "Partitions.Count" in expression:
                partitions = obj.get('partitions', [])
                if "= 1" in expression:
                    return len(partitions) == 1
            
            # Calculation items count
            if obj_type == "calculation_group" and "CalculationItems.Count" in expression:
                calc_group = obj.get('calculationGroup', {})
                calc_items = calc_group.get('calculationItems', [])
                if "== 0" in expression:
                    return len(calc_items) == 0
            
            # Relationship checks
            if obj_type == "relationship":
                if "FromCardinality" in expression and "ToCardinality" in expression:
                    from_card = obj.get('fromCardinality', '')
                    to_card = obj.get('toCardinality', '')
                    if '"Many"' in expression:
                        return from_card == 'many' and to_card == 'many'
                
                if "CrossFilteringBehavior" in expression:
                    cross_filter = obj.get('crossFilteringBehavior', '')
                    if "BothDirections" in expression:
                        return cross_filter == 'bothDirections'
            
            # Default: return False for unhandled expressions
            return False
            
        except Exception as e:
            logger.debug(f"Error evaluating expression '{expression}': {str(e)}")
            return False

    def get_violations_summary(self) -> Dict[str, Any]:
        """Get a summary of violations by category and severity"""
        summary = {
            'total_violations': len(self.violations),
            'by_severity': {},
            'by_category': {},
            'by_object_type': {}
        }
        
        for violation in self.violations:
            # By severity
            severity_name = violation.severity.name
            summary['by_severity'][severity_name] = summary['by_severity'].get(severity_name, 0) + 1
            
            # By category
            category = violation.category
            summary['by_category'][category] = summary['by_category'].get(category, 0) + 1
            
            # By object type
            obj_type = violation.object_type
            summary['by_object_type'][obj_type] = summary['by_object_type'].get(obj_type, 0) + 1
        
        return summary

    def get_violations_by_severity(self, severity: BPASeverity) -> List[BPAViolation]:
        """Get violations filtered by severity level"""
        return [v for v in self.violations if v.severity == severity]

    def get_violations_by_category(self, category: str) -> List[BPAViolation]:
        """Get violations filtered by category"""
        return [v for v in self.violations if v.category == category]

    def export_violations_to_dict(self) -> List[Dict[str, Any]]:
        """Export violations to a list of dictionaries for JSON serialization"""
        return [
            {
                'rule_id': v.rule_id,
                'rule_name': v.rule_name,
                'category': v.category,
                'severity': v.severity.name,
                'severity_level': v.severity.value,
                'description': v.description,
                'object_type': v.object_type,
                'object_name': v.object_name,
                'table_name': v.table_name,
                'fix_expression': v.fix_expression,
                'details': v.details
            }
            for v in self.violations
        ]
