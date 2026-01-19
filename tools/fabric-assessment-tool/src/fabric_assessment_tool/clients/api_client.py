# Copyright (c) Microsoft Corporation.
# Licensed under the MIT License.

import json
import platform
import re
import time
from argparse import Namespace
from typing import Optional
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter, Retry
from requests.structures import CaseInsensitiveDict
import urllib

from fabric_assessment_tool.errors.api import AzureAPIError, FATError

GUID_PATTERN = r"([a-f0-9\-]{36})"
DEBUG = False


class ApiResponse:
    def __init__(
        self,
        status_code: int,
        text: str,
        content: bytes,
        headers: CaseInsensitiveDict[str],
    ):
        self.status_code = status_code
        self.text = text
        self.headers = headers
        self.content = content

    def append_text(self, text: str, total_pages: int = 0):
        try:
            original_text = json.loads(self.text)
            new_text = json.loads(text)

            for key, value in original_text.items():
                if isinstance(value, list) and key in new_text:
                    original_text[key].extend(new_text[key])

            original_text.pop("continuationToken", None)
            original_text.pop("continuationUri", None)
            original_text.pop("prev_page_token", None)
            original_text.pop("next_page_token", None)
            original_text.pop("nextLink", None)
            original_text["total_pages"] = total_pages + 1

            self.text = json.dumps(original_text)
        except json.JSONDecodeError as e:
            raise FATError(
                f"Failed to decode JSON: {str(e)}",
                "InvalidJson",
            )

    def json(self):
        return json.loads(self.text)


class ApiClient:

    def __init__(
        self,
        base_url: str | None = None,
        scope: str | None = None,
        api_version: str | None = None,
        retries_count: int = 3,
        token: str | None = None,
    ) -> None:
        self.base_url = base_url if base_url else "management.azure.com"
        self.scope = [scope] if scope else ["https://management.azure.com/.default"]
        self.api_version = api_version if api_version else "2021-06-01"

        self.session = requests.Session()
        self.retries_count = retries_count
        retries = Retry(
            total=retries_count, backoff_factor=1, status_forcelist=[502, 503, 504]
        )
        adapter = HTTPAdapter(max_retries=retries)
        self.session.mount("https://", adapter)
        self.session.headers.update(
            {
                "User-Agent": f"fabric_assessment_tool/0.0.1 ({platform.system()}; {platform.machine()}; {platform.release()})",
            }
        )
        if token:
            self.session.headers.update(
                {
                    "Authorization": "Bearer " + str(token),
                }
            )

    def do_request(
        self,
        args,
        json=None,
        data=None,
        files=None,
        timeout_sec=240,
        continuation_token=None,
        skip_token=None,
        hostname=None,
    ) -> ApiResponse:
        json_file = getattr(args, "json_file", None)
        audience_value = getattr(args, "audience", None)
        headers_value = getattr(args, "headers", None)
        method = getattr(args, "method", "get")
        wait = getattr(args, "wait", True)  # Operations are synchronous by default
        raw_response = getattr(args, "raw_response", False)
        request_params = getattr(args, "request_params", {})
        uri = args.uri.split("?")[0]
        # Get query parameters from URI and add them to request_params extracted from args
        _params_from_uri = (
            args.uri.split("?")[1] if len(args.uri.split("?")) > 1 else None
        )
        if _params_from_uri:
            _params = _params_from_uri.split("&")
            for _param in _params:
                _key, _value = _param.split("=")
                request_params[_key] = _value

        if "api-version" not in request_params.keys() and self.api_version != "":
            request_params["api-version"] = self.api_version

        # TODO: Json file
        # if json_file is not None:
        #     json = files_utils.load_json_from_path(json_file)

        if continuation_token:
            request_params["continuationToken"] = continuation_token
        
        if skip_token:
            request_params["$skipToken"] = skip_token

        # Build url
        url = f"https://{self.base_url}/{uri}"
        if request_params:
            url += f"?{requests.compat.urlencode(request_params)}"
            url = url.replace("%24skipToken=", "$skipToken=")  # Fix encoding for single quotes

        # Build headers
        headers = {}

        if files is None:
            headers["Content-Type"] = "application/json"

        if headers_value is not None:
            if isinstance(args.headers, dict):
                headers.update(args.headers)
            else:
                raise FATError(
                    "The headers format is invalid",
                    "InvalidOperation",
                )

        try:

            request_params = {
                "headers": headers,
                "timeout": timeout_sec,
            }

            if files is not None:
                request_params["files"] = files
            elif json is not None:
                request_params["json"] = json
            elif data is not None:
                request_params["data"] = data

            for attempt in range(self.retries_count + 1):

                # TODO: Log request
                start_time = time.time()
                response = self.session.request(
                    method=method, url=url, **request_params
                )
                # TODO: Log Response

                api_error_code = response.headers.get(
                    "x-ms-public-api-error-code", None
                ) or response.headers.get("x-ms-error-code", None)

                if raw_response:
                    return ApiResponse(
                        status_code=response.status_code,
                        text=response.text,
                        content=response.content,
                        headers=response.headers,
                    )

                match response.status_code:
                    case 401:
                        raise FATError(
                            "Access is unauthorized",
                            api_error_code or "Unauthorized",
                        )
                    case 403:
                        raise FATError(
                            "Access is forbidden. You do not have permission to access this resource",
                            api_error_code or "Forbidden",
                        )
                    case 404:
                        raise FATError(
                            "The requested resource could not be found",
                            "NotFound",
                        )
                    case 429:
                        retry_after = int(response.headers["Retry-After"])
                        print(
                            f"Rate limit exceeded. {attempt}º retrying attemp in {retry_after} seconds"
                        )
                        time.sleep(retry_after)
                        continue
                    case 201 | 202 if wait and self.scope == [
                        "https://management.azure.com/.default"
                    ]:
                        # Track Azure API asynchronous operations
                        api_response = ApiResponse(
                            status_code=response.status_code,
                            text=response.text,
                            content=response.content,
                            headers=response.headers,
                        )
                        print(f"Operation started. Polling for result...")
                        return self._handle_azure_async_op(api_response)
                    case c if c in [200, 201, 202, 204]:
                        api_response = ApiResponse(
                            status_code=response.status_code,
                            text=response.text,
                            content=response.content,
                            headers=response.headers,
                        )
                        return self._handle_successful_response(args, api_response)
                    case _:
                        if "management.azure.com" in url:
                            raise AzureAPIError(response.text)
                        raise FATError(
                            f"An unexpected error occurred with status code: {response.status_code} and message: {response.text}",
                            self.map_http_status_code_to_error_code(
                                response.status_code
                            ),
                        )

            raise FATError(
                f"Maximum retries ({self.retries_count}) exceeded. The operation could not be completed",
                "MaxRetriesExceeded",
            )

        except requests.RequestException as ex:
            raise FATError(
                f"An unexpected error occurred: {str(ex)}",
                "UnexpectedError",
            ) from ex

    # Utils

    def map_http_status_code_to_error_code(self, status_code: int) -> str:
        """
        Map HTTP status codes to Fabric CLI error codes.
        """
        if status_code == 400:
            return "BadRequest"
        elif status_code == 401:
            return "Unauthorized"
        elif status_code == 403:
            return "Forbidden"
        elif status_code == 404:
            return "NotFound"
        elif status_code == 409:
            return "Conflict"
        elif status_code == 500:
            return "InternalServerError"
        else:
            return "UnexpectedError"

    def _handle_successful_response(
        self, args: Namespace, response: ApiResponse
    ) -> ApiResponse:

        if DEBUG:
            self._print_response_details(response)

        _continuation_token = None

        # In ADLS Gen2 / Onelake, check for x-ms-continuation token in response headers
        if "x-ms-continuation" in response.headers:
            # utils_ui.print_info(
            #     f"Continuation token found for Onelake. Fetching next page of results..."
            # )
            _continuation_token = response.headers["x-ms-continuation"]
        # In Fabric, check for continuation token in response text
        elif response.text != "" and response.text != "null":
            if "continuationToken" in response.text:
                _text = json.loads(response.text)
                if _text and "continuationToken" in _text:
                    _continuation_token = _text["continuationToken"]
                    # utils_ui.print_info(
                    #     f"Continuation token found for Fabric. Fetching next page of results..."
                    # )

        if _continuation_token:
            _response = self.do_request(args, continuation_token=_continuation_token)
            if _response.status_code == 200:
                response.status_code = 200
                response.append_text(_response.text)
            return response
        
        # Synapse nextLink pagination
        if response.text != "" and response.text != "null":
            if "nextLink" in response.text:
                _text = json.loads(response.text)
                if _text and "nextLink" in _text:
                    next_link = _text["nextLink"]
                    skip_token = urllib.parse.parse_qs(next_link)['$skipToken'][0]
                    _response = self.do_request(args, skip_token=skip_token)
                    if _response.status_code == 200:
                        response.status_code = 200
                        response.append_text(_response.text)
                    return response

        # TODO: Review Databricks approach to page tokens
        if response.text != "" and response.text != "null":
            if "next_page_token" in response.text:
                _text = json.loads(response.text)
                if _text and "next_page_token" in _text:
                    _page_token = _text["next_page_token"]
                    args.request_params["page_token"] = _page_token
                    # utils_ui.print_info(
                    #     f"Continuation token found for Fabric. Fetching next page of results..."
                    # )
                    _response = self.do_request(
                        args, continuation_token=_continuation_token
                    )
                    if _response.status_code == 200:
                        response.status_code = 200
                        response.append_text(_response.text)
                    args.request_params.pop("page_token", None)
                    return response

        return response

    def _print_response_details(self, response: ApiResponse) -> None:
        response_details = dict(
            {
                "status_code": response.status_code,
                "response": response.text,
                "headers": dict(response.headers),
            }
        )

        try:
            response_details["response"] = dict(json.loads(response.text))
        except json.JSONDecodeError:
            pass

        print(json.dumps(dict(response_details), indent=4))

    def _handle_azure_async_op(self, response: ApiResponse) -> ApiResponse:
        uri = response.headers.get("Azure-AsyncOperation")
        if uri is None:
            # Check fot the Location header
            uri = response.headers.get("Location")
            check_status = False
        else:
            check_status = True

        if uri is None or not "management.azure.com" in uri:
            raise AzureAPIError(response.text)

        uri = uri[uri.find("management.azure.com") + len("management.azure.com") :]
        return self._poll_operation(
            "azure",
            uri,
            response,
            ["https://management.azure.com/.default"],
            check_status,
        )

    def _poll_operation(
        self,
        audience,
        uri,
        original_response: ApiResponse,
        check_status,
        hostname=None,
    ) -> ApiResponse:
        args = Namespace()
        args.uri = uri
        args.audience = audience
        args.method = "get"
        args.wait = False
        args.params = {}

        initial_interval = 10  # TODO: Config
        time.sleep(initial_interval)

        while True:
            response = self.do_request(args, hostname=hostname)

            if response.status_code == 200:
                if check_status:
                    result_json = response.json()
                    status = result_json.get("status")
                    #
                    if status == "Succeeded" or status == "Completed":
                        print(status)
                        if self.scope == ["https://management.azure.com/.default"]:
                            original_response.status_code = 200
                            return original_response
                    elif status == "Failed":
                        print(status)
                        raise FATError(
                            f"The operation failed: {str(result_json.get('error'))}",
                            "LongRunningOperationFailed",
                        )
                    elif status == "Cancelled":
                        print(status)
                        raise FATError(
                            f"The operation was cancelled: {str(result_json.get('error'))}"
                            "LongRunningOperationCancelled",
                        )
                    else:
                        # Any other status is considered running
                        self._log_operation_progress(result_json)
                        interval = 10  # TODO: Config
                        time.sleep(interval)
                else:
                    original_response.status_code = 200
                    return original_response
            elif not check_status and response.status_code in [202, 201]:
                interval = 10  # TODO: Config
                time.sleep(interval)
            else:
                raise FATError(
                    f"An unexpected error occurred with status code: {response.status_code} and message: {response.text}",
                    self.map_http_status_code_to_error_code(response.status_code),
                )

    def _log_operation_progress(self, result_json: dict) -> None:
        # Common behaviour for Azure and Fabric REST APIs
        status = result_json.get("status")
        percentage_complete = result_json.get("percentageComplete")
        if percentage_complete is None:
            # But sometimes is missing in the response
            print(status)
        else:
            print(status, percentage_complete)

    def check_token_expired(self, response: ApiResponse) -> bool:
        if response.status_code == 401:
            try:
                _text = json.loads(response.text)
                if _text.get("errorCode", "") == "TokenExpired":
                    return True
            except json.JSONDecodeError:
                pass
        return False
