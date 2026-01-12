import { parseARMExpression, extractComponentName } from '../validation';

// Test cases for ARM expression parsing
const testCases = [
  {
    input: "[concat(parameters('factoryName'), '/pipeline1')]",
    expected: "pipeline1",
    description: "Standard concat with factoryName and pipeline name"
  },
  {
    input: "[concat(parameters('factoryName'), '/myDataset')]",
    expected: "myDataset", 
    description: "Concat with factoryName and dataset name"
  },
  {
    input: "[concat(parameters('factoryName'),'/linkedService1')]",
    expected: "linkedService1",
    description: "Concat without space after comma"
  },
  {
    input: "[concat(parameters(factoryName), '/trigger1')]",
    expected: "trigger1",
    description: "Concat with parameter without quotes"
  },
  {
    input: "simplePipelineName",
    expected: "simplePipelineName",
    description: "Simple string without ARM expression"
  },
  {
    input: "/leadingSlash",
    expected: "leadingSlash",
    description: "String with leading slash should be cleaned"
  },
  {
    input: "[parameters('directParameter')]",
    expected: "directParameter",
    description: "Direct parameter reference (not factoryName)"
  },
  {
    input: "[variables('variableName')]",
    expected: "variableName",
    description: "Variable reference"
  },
  {
    input: "[concat(parameters('prefix'), '/middle/', parameters('suffix'))]",
    expected: "suffix",
    description: "Complex concat with multiple parameters - should extract last meaningful part"
  },
  {
    input: "",
    expected: "",
    description: "Empty string"
  },
  {
    input: "[concat(parameters('factoryName'), '')]",
    expected: "",
    description: "Concat with empty string component"
  }
];

// Simple test runner (since we don't have a full test framework)
export function runArmExpressionTests(): { passed: number; failed: number; results: Array<{ test: string; passed: boolean; error?: string }> } {
  const results: Array<{ test: string; passed: boolean; error?: string }> = [];
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      const result = parseARMExpression(testCase.input);
      const success = result === testCase.expected;
      
      if (success) {
        passed++;
      } else {
        failed++;
      }
      
      results.push({
        test: `${testCase.description}: "${testCase.input}" -> expected "${testCase.expected}", got "${result}"`,
        passed: success,
        ...(success ? {} : { error: `Expected "${testCase.expected}", got "${result}"` })
      });
    } catch (error) {
      failed++;
      results.push({
        test: `${testCase.description}: "${testCase.input}"`,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return { passed, failed, results };
}

// Test the extractComponentName function as well
export function runExtractComponentNameTests(): { passed: number; failed: number; results: Array<{ test: string; passed: boolean; error?: string }> } {
  const results: Array<{ test: string; passed: boolean; error?: string }> = [];
  let passed = 0;
  let failed = 0;

  const extractTestCases = [
    {
      input: "[concat(parameters('factoryName'), '/testPipeline')]",
      expected: "testPipeline",
      description: "Extract component name from ARM expression"
    },
    {
      input: "directName",
      expected: "directName",
      description: "Extract from direct string"
    },
    {
      input: null,
      expected: "",
      description: "Handle null input"
    },
    {
      input: undefined,
      expected: "",
      description: "Handle undefined input"
    }
  ];

  for (const testCase of extractTestCases) {
    try {
      const result = extractComponentName(testCase.input);
      const success = result === testCase.expected;
      
      if (success) {
        passed++;
      } else {
        failed++;
      }
      
      results.push({
        test: `${testCase.description}: ${JSON.stringify(testCase.input)} -> expected "${testCase.expected}", got "${result}"`,
        passed: success,
        ...(success ? {} : { error: `Expected "${testCase.expected}", got "${result}"` })
      });
    } catch (error) {
      failed++;
      results.push({
        test: `${testCase.description}: ${JSON.stringify(testCase.input)}`,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return { passed, failed, results };
}