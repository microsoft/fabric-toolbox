"""
Power BI Desktop Detection Usage Examples

This file demonstrates how to use the Power BI Desktop detection capabilities
of the Semantic Model MCP Server.
"""

import json
import sys
import os

# Add the parent directory to the Python path to import modules
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

from tools.powerbi_desktop_detector import detect_powerbi_desktop_instances, test_powerbi_desktop_connection

def example_1_detect_instances():
    """Example 1: Detect all running Power BI Desktop instances."""
    print("🔍 Example 1: Detecting Power BI Desktop Instances")
    print("-" * 50)
    
    # Call the detection function
    result = detect_powerbi_desktop_instances()
    
    # Parse the JSON result
    data = json.loads(result)
    
    if data['success']:
        print(f"✅ Detection successful!")
        print(f"📊 Total Power BI Desktop instances: {data['total_instances']}")
        print(f"🔧 Total Analysis Services instances: {data['total_as_instances']}")
        
        # Show Power BI Desktop instances
        if data['powerbi_desktop_instances']:
            print("\n🖥️ Power BI Desktop Instances:")
            for i, instance in enumerate(data['powerbi_desktop_instances'], 1):
                print(f"  Instance {i}:")
                print(f"    - Process ID: {instance['pid']}")
                print(f"    - File Path: {instance.get('file_path', 'Not detected')}")
                print(f"    - AS Port: {instance.get('analysis_services_port', 'Not detected')}")
                print(f"    - Connection: {instance.get('connection_string', 'Not available')}")
        
        # Show Analysis Services instances
        if data['analysis_services_instances']:
            print("\n⚙️ Analysis Services Instances:")
            for i, instance in enumerate(data['analysis_services_instances'], 1):
                print(f"  Instance {i}:")
                print(f"    - Process ID: {instance['pid']}")
                print(f"    - Port: {instance.get('port', 'Not detected')}")
                print(f"    - Power BI Desktop: {instance.get('is_powerbi_desktop', False)}")
                print(f"    - Connection: {instance.get('connection_string', 'Not available')}")
        
        return data
    else:
        print(f"❌ Detection failed: {data.get('error', 'Unknown error')}")
        return None

def example_2_test_connection(port=None):
    """Example 2: Test connection to a Power BI Desktop instance."""
    print("\n🔌 Example 2: Testing Power BI Desktop Connection")
    print("-" * 50)
    
    if port is None:
        # First detect instances to get a port
        detection_result = detect_powerbi_desktop_instances()
        data = json.loads(detection_result)
        
        # Find a port from the detected instances
        for instance in data.get('powerbi_desktop_instances', []):
            if instance.get('analysis_services_port'):
                port = instance['analysis_services_port']
                break
        
        if port is None:
            print("⚠️ No Power BI Desktop instances with ports detected.")
            print("💡 To test this example:")
            print("   1. Open Power BI Desktop")
            print("   2. Open a .pbix file")
            print("   3. Run this example again")
            return
    
    print(f"🔗 Testing connection to localhost:{port}")
    
    # Test the connection
    result = test_powerbi_desktop_connection(port)
    
    # Parse the result
    data = json.loads(result)
    
    if data['success']:
        print("✅ Connection successful!")
        print(f"🔧 Port: {data['port']}")
        print(f"📡 Connection String: {data['connection_string']}")
        
        if 'server_properties' in data:
            print("\n📋 Server Properties:")
            for prop in data['server_properties']:
                print(f"  - {prop['PropertyName']}: {prop['PropertyValue']}")
    else:
        print("❌ Connection failed!")
        print(f"🔧 Port: {data['port']}")
        print(f"📡 Connection String: {data['connection_string']}")
        print(f"⚠️ Error: {data.get('error', 'Unknown error')}")
        print(f"💬 Message: {data.get('message', 'No message')}")

def example_3_development_workflow():
    """Example 3: Typical development workflow using local Power BI Desktop."""
    print("\n🔄 Example 3: Development Workflow")
    print("-" * 50)
    
    print("🎯 Typical workflow for local Power BI Desktop development:")
    print()
    
    # Step 1: Detect instances
    print("Step 1: Detect running Power BI Desktop instances")
    detection_result = detect_powerbi_desktop_instances()
    data = json.loads(detection_result)
    
    if data['success'] and data['total_instances'] > 0:
        print(f"   ✅ Found {data['total_instances']} instance(s)")
        
        # Get connection information
        for instance in data['powerbi_desktop_instances']:
            if instance.get('connection_string'):
                print(f"   🔗 Connection: {instance['connection_string']}")
                port = instance.get('analysis_services_port')
                
                if port:
                    # Step 2: Test connection
                    print("\nStep 2: Test connection")
                    test_result = test_powerbi_desktop_connection(port)
                    test_data = json.loads(test_result)
                    
                    if test_data['success']:
                        print("   ✅ Connection verified")
                        
                        # Step 3: Development actions
                        print("\nStep 3: Available development actions")
                        print("   🔍 Run BPA analysis against local model")
                        print("   🧮 Execute test DAX queries")
                        print("   📊 Validate model structure")
                        print("   🚀 Test performance with local data")
                        
                        print("\n💡 MCP Server commands you can use:")
                        print("   - detect_local_powerbi_desktop()")
                        print("   - test_local_powerbi_connection(port)")
                        print("   - analyze_model_bpa() with local connection")
                        print("   - execute_dax_query() against local instance")
                        
                        break
                    else:
                        print("   ❌ Connection failed - check Power BI Desktop status")
    else:
        print("   ⚠️ No Power BI Desktop instances detected")
        print("\n💡 To get started:")
        print("   1. Open Power BI Desktop")
        print("   2. Open or create a .pbix file")
        print("   3. Run this workflow again")

def main():
    """Run all examples."""
    print("🚀 Power BI Desktop Detection Usage Examples")
    print("=" * 60)
    
    try:
        # Example 1: Basic detection
        detection_data = example_1_detect_instances()
        
        # Example 2: Connection testing
        example_2_test_connection()
        
        # Example 3: Development workflow
        example_3_development_workflow()
        
        print("\n" + "=" * 60)
        print("🎉 Examples completed successfully!")
        
        if detection_data and detection_data['total_instances'] > 0:
            print("\n✨ You have Power BI Desktop running - you can use the MCP server tools!")
        else:
            print("\n💡 Open Power BI Desktop to see the full capabilities in action.")
    
    except Exception as e:
        print(f"\n❌ Error running examples: {e}")

if __name__ == "__main__":
    main()
