"""
Test script for Power BI Desktop Detection functionality

This script tests the Power BI Desktop detection capabilities without requiring
a running Power BI Desktop instance.
"""

import sys
import os
import json

# Add the parent directory to the Python path to import modules
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

def test_import():
    """Test that we can import the Power BI Desktop detector."""
    try:
        from tools.powerbi_desktop_detector import PowerBIDesktopDetector, detect_powerbi_desktop_instances
        print("✅ Successfully imported Power BI Desktop detection modules")
        return True
    except ImportError as e:
        print(f"❌ Failed to import modules: {e}")
        return False

def test_detector_creation():
    """Test creating a PowerBIDesktopDetector instance."""
    try:
        from tools.powerbi_desktop_detector import PowerBIDesktopDetector
        detector = PowerBIDesktopDetector()
        print("✅ Successfully created PowerBIDesktopDetector instance")
        print(f"   Process names to search: {detector.pbi_process_names}")
        return True
    except Exception as e:
        print(f"❌ Failed to create detector: {e}")
        return False

def test_detection_functions():
    """Test the detection functions (will likely find no instances)."""
    try:
        from tools.powerbi_desktop_detector import PowerBIDesktopDetector
        detector = PowerBIDesktopDetector()
        
        # Test finding Power BI Desktop instances
        pbi_instances = detector.find_powerbi_desktop_instances()
        print(f"✅ Power BI Desktop detection completed")
        print(f"   Found {len(pbi_instances)} Power BI Desktop instances")
        
        # Test finding Analysis Services instances
        as_instances = detector.find_analysis_services_ports()
        print(f"✅ Analysis Services detection completed")
        print(f"   Found {len(as_instances)} Analysis Services instances")
        
        # Test combined detection
        combined = detector.get_powerbi_desktop_connections()
        print(f"✅ Combined detection completed")
        print(f"   Found {len(combined)} combined instances")
        
        return True
    except Exception as e:
        print(f"❌ Detection failed: {e}")
        return False

def test_main_functions():
    """Test the main detection functions."""
    try:
        from tools.powerbi_desktop_detector import detect_powerbi_desktop_instances, test_powerbi_desktop_connection
        
        # Test main detection function
        result = detect_powerbi_desktop_instances()
        print("✅ Main detection function completed")
        
        # Parse the result
        try:
            result_data = json.loads(result)
            print(f"   Success: {result_data.get('success', False)}")
            print(f"   Total instances: {result_data.get('total_instances', 0)}")
            print(f"   Total AS instances: {result_data.get('total_as_instances', 0)}")
        except json.JSONDecodeError:
            print("   Result is not valid JSON")
        
        return True
    except Exception as e:
        print(f"❌ Main function test failed: {e}")
        return False

def test_mock_connection():
    """Test connection testing with a mock port."""
    try:
        from tools.powerbi_desktop_detector import test_powerbi_desktop_connection
        
        # Test with a port that definitely won't work (for testing purposes)
        result = test_powerbi_desktop_connection(12345)
        print("✅ Connection test function completed")
        
        # Parse the result
        try:
            result_data = json.loads(result)
            print(f"   Success: {result_data.get('success', False)}")
            print(f"   Port: {result_data.get('port', 'Unknown')}")
            print(f"   Message: {result_data.get('message', 'No message')}")
        except json.JSONDecodeError:
            print("   Result is not valid JSON")
        
        return True
    except Exception as e:
        print(f"❌ Connection test failed: {e}")
        return False

def main():
    """Run all tests."""
    print("🔍 Testing Power BI Desktop Detection Functionality")
    print("=" * 60)
    
    tests = [
        ("Import Test", test_import),
        ("Detector Creation", test_detector_creation),
        ("Detection Functions", test_detection_functions),
        ("Main Functions", test_main_functions),
        ("Mock Connection Test", test_mock_connection)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n🧪 Running {test_name}...")
        try:
            if test_func():
                passed += 1
            else:
                print(f"   Test failed")
        except Exception as e:
            print(f"   ❌ Test error: {e}")
    
    print("\n" + "=" * 60)
    print(f"📊 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Power BI Desktop detection is ready to use.")
        print("\n💡 To test with real Power BI Desktop:")
        print("   1. Open Power BI Desktop with a .pbix file")
        print("   2. Run the detection tools from the MCP server")
        print("   3. Use the returned port numbers for local connections")
    else:
        print("⚠️  Some tests failed. Check the error messages above.")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
