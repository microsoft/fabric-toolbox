import html
import json


class LakeLenseError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.message = message.rstrip(".")
        self.status_code = status_code

    def __str__(self):
        return (
            f"[{self.status_code}] {self.args[0]}"
            if self.status_code
            else f"{self.args[0]}"
        )

    def formatted_message(self, debug=False):
        escaped_text = html.escape(self.message)

        return (
            f"[{self.status_code}] {escaped_text}"
            if self.status_code
            else f"{escaped_text}"
        )


class AzureAPIError(LakeLenseError):
    def __init__(self, response_text):
        """
        Represents an error response from the Azure REST API.
        https://learn.microsoft.com/en-us/rest/api/microsoftfabric/fabric-capacities/get?view=rest-microsoftfabric-2023-11-01&tabs=HTTP#errordetail:~:text=Other%20Status%20Codes-,ErrorResponse,-An%20unexpected%20error

        The error response follows this structure:
        {
            "error": {
                "code": "string",                   # The error code.
                "message": "string",                # The error message.
                "target": "string",                 # The error target (optional).
                "details": [                        # A list of additional error details (optional).
                    {
                        "code": "string",           # The detail error code.
                        "message": "string",        # The detail error message.
                        "target": "string",         # The detail error target (optional).
                        "additionalInfo": [         # Additional information (optional).
                            {
                                "type": "string",   # The type of additional info.
                                "info": {}          # The additional info object.
                            }
                        ]
                    }
                ],
                "additionalInfo": [                 # Additional information at the main error level (optional).
                    {
                        "type": "string",           # The type of additional info.
                        "info": {}                  # The additional info object.
                    }
                ]
            }
        }

        Attributes:
            code (str): The main error code.
            message (str): A descriptive message about the error.
            target (str, optional): The target of the error.
            details (list): A list of additional error details, if available.
            additional_info (list): Additional info at the main error level, if available.
        """
        response_data = json.loads(response_text)
        error_data = response_data.get("error", {})
        code = error_data.get("code")
        message = error_data.get("message")

        details: list[dict] = error_data.get("details", [])

        # Extract RootActivityId from the details
        self.request_id = None
        for detail in details:
            if detail.get("code") == "RootActivityId":
                self.request_id = detail.get("message")
                break

        super().__init__(message, code)

    def formatted_message(self, debug=False):
        final_message = super().formatted_message(debug)

        if self.request_id:
            final_message += f"\n<grey>∟ Request Id: {self.request_id}</grey>"

        return final_message
