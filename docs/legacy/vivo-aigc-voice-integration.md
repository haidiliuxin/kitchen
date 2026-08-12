# 历史资料：比赛期间 vivo AIGC 语音接入

> 已归档，禁止生产使用。本文中的 vivo ASR、TTS、蓝心和通用凭据命名均不再属于 Kitchen 生产架构。当前仅保留 vivo OCR，并且只能使用 `OCR_VIVO_*`。实时语音请以 `docs/voice-architecture.md` 为准。

# vivo AIGC Integration Notes for Claude

This document summarizes the relevant vivo AIGC documentation needed for implementing voice interaction, TTS playback, Function Calling, and AppKey authentication.

The project should use official vivo AIGC capabilities where applicable. Do not mock API results in production user flows.

---

# 1. AppKey Authentication

## 1.1 Basic Usage

Get the `AppKey` from the vivo AIGC official platform.

When calling vivo AIGC HTTP or WebSocket APIs directly, the request must include the following header:

Authorization: Bearer AppKey

Example:

Authorization: Bearer your_AppKey

Important details:

1. `Bearer` must not be omitted.
2. There must be one space between `Bearer` and the AppKey.
3. The AppKey should be passed in the `Authorization` header, not as a URL parameter.
4. Do not hardcode real AppKey values in source code.

---

## 1.2 Common Authentication Errors

If authentication fails, the API returns HTTP 401.

Common responses:

| Response Body                                                   | Meaning                                                              | Suggested Handling                                             |
| --------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| {"message":"missing required app_id in the request header"}     | Invalid or malformed authentication string                           | Check whether the `Authorization` header is correctly provided |
| {"message":"invalid api-key"}                                   | Invalid AppKey                                                       | Check whether the AppKey is correct                            |
| {"message":"not having this ability, you need to apply for it"} | The current application does not have permission for this capability | Apply for the capability or contact the system administrator   |

---

## 1.3 Notes from the Official OCR Example

The official OCR example contains two issues that must be fixed before use.

### Issue 1: `AppId` is used but not defined

The example uses:

businessid: "aigc" + AppId

But `AppId` is not defined in the code.

Implementation should provide `AppId`, preferably through environment variables.

### Issue 2: Function name mismatch

The example defines:

ocr_test()

But calls:

test()

This causes a function-not-defined error.

The function name should be made consistent.

---

# 2. ASR: Real-Time Short Speech Recognition

## 2.1 Document Location

Document Center / API Documentation / ASR / Real-Time Short Speech Recognition

## 2.2 Capability Name

Real-Time Short Speech Recognition

## 2.3 Updated At

2026-03-13 10:48:12

---

## 2.4 Service Description

This API provides a real-time ASR interaction protocol based on WebSocket.

It is intended for short speech recognition.

Short speech means:

A single recognition session should be within 60 seconds.

---

## 2.5 Protocol Overview

The real-time ASR service uses WebSocket for data transmission.

The process has two stages:

1. WebSocket handshake stage.
2. Real-time communication stage.

---

## 2.6 Audio Format Requirement

Supported audio format:

16kHz / 16-bit / mono / PCM

---

## 2.7 WebSocket Endpoint

Domain:

api-ai.vivo.com.cn

WebSocket URL format:

ws://api-ai.vivo.com.cn/asr/v2?key1=val1&key2=val2&keyn=valn

URL parameters are appended using standard `key=value` query parameters.

---

## 2.8 Handshake Headers

| Header        | Type   | Required | Value         |
| ------------- | ------ | -------- | ------------- |
| Authorization | string | yes      | Bearer AppKey |

---

## 2.9 Handshake URL Parameters

| Field           | Type   | Description                                                   | Required | URL Encode | Notes                                        |
| --------------- | ------ | ------------------------------------------------------------- | -------- | ---------- | -------------------------------------------- |
| model           | string | Phone model                                                   | no       | yes        |                                              |
| system_version  | string | Phone system version                                          | no       | yes        |                                              |
| client_version  | string | App version                                                   | yes      | yes        | Can use "unknown"                            |
| package         | string | App package name                                              | yes      | yes        | Can use "unknown"                            |
| sdk_version     | string | SDK version                                                   | yes      | yes        | Can use "unknown"                            |
| user_id         | string | 32-character user ID, including numbers and lowercase letters | yes      | yes        | Unique identifier                            |
| android_version | string | Android version                                               | yes      | yes        | Can use "unknown"                            |
| system_time     | string | System time                                                   | yes      | yes        | Unix timestamp in milliseconds               |
| net_type        | string | Network type                                                  | yes      | yes        | 0 for mobile data, 1 for Wi-Fi               |
| engineid        | string | Capability ID                                                 | yes      | yes        | Usually use `shortasrinput` for short speech |
| requestId       | uuid   | Trace ID                                                      | yes      | no         |                                              |

---

## 2.10 Sending Speech Recognition Requests

After the WebSocket connection is established, the client should:

1. Send a text frame first.
2. Then send binary audio frames.

---

## 2.11 Initial Text Frame

After the WebSocket connection succeeds, the client first sends a WebSocket text frame.

The payload is a JSON string.

### Text Frame Parameters

| Parameter                | Type   | Description                                   | Required | Notes                                |
| ------------------------ | ------ | --------------------------------------------- | -------- | ------------------------------------ |
| type                     | string | Type of the text packet                       | yes      | `started`                            |
| request_id               | string | UUID identifying this request, 32 characters  | yes      |                                      |
| asr_info.end_vad_time    | int    | Backend VAD detection time                    | yes      | milliseconds                         |
| asr_info.audio_type      | string | Audio type                                    | yes      | `pcm` or `opus`                      |
| asr_info.chinese2digital | int    | Whether to convert Chinese numerals to digits | yes      | 0 disabled, 1 enabled                |
| asr_info.punctuation     | int    | Whether punctuation is enabled                | yes      | 0 no punctuation, 1 with punctuation |
| business_info            | string | Extension field for passthrough information   | no       |                                      |

---

## 2.12 Binary Audio Frames

After sending the text frame, the client sends audio data using WebSocket binary frames.

Requirements:

1. Opcode should be binary.
2. Payload should be audio data.
3. Audio should be sent in frames.
4. Recommended frame duration: 40 ms per frame.
5. A single utterance must not exceed 60 seconds.

---

## 2.13 End and Close Markers

After audio data is fully sent, send a binary frame with payload:

' --end –- '

This indicates that audio transmission is complete.

To close the connection, send a binary frame with payload:

' --close-- '

The server exits the connection after receiving it.

---

## 2.14 ASR Response Types

### Handshake Success

Fields:

action: started
code: 0
data: ""
desc: success
sid: session ID

Example:

{
"action": "started",
"code": 0,
"data": "",
"desc": "success",
"sid": "5e094340-31be-47e7-83ad-7c6f27cd4f74"
}

---

### Handshake Failure

Fields:

action: error
code: 1001
data: ""
desc: time out
sid: session ID

Example:

{
"action": "error",
"code": 1001,
"data": "",
"desc": "time out",
"sid": "5e094340-31be-47e7-83ad-7c6f27cd4f74"
}

---

### Recognition Result

Example:

{
"sid": "e831d141-34e0-4617-a1b9-4ba43811453c@91",
"is_finish": false,
"data": {
"result_id": 91,
"reformation": 1,
"is_last": true,
"text": "气场中的场的部首共是多少笔。"
},
"action": "result",
"request_id": "req_id",
"code": 0,
"desc": "success",
"type": "asr"
}

---

## 2.15 ASR Response Field Meanings

| Field  | Type   | Meaning                                      |
| ------ | ------ | -------------------------------------------- |
| action | string | Return type. `started`, `result`, or `error` |
| type   | string | Business type. `asr`, `nlu`, or `common`     |
| code   | int    | Return code. Success is 0                    |
| data   | object | Result data                                  |
| desc   | string | Description                                  |
| sid    | string | Session ID                                   |

### `data` Field

| Field         | Type   | Meaning                                                   |
| ------------- | ------ | --------------------------------------------------------- |
| text          | string | ASR recognition result                                    |
| result_id     | int    | Result sequence number                                    |
| reformation   | int    | 1 means correction, 0 means append                        |
| business_info | string | Passthrough field                                         |
| is_last       | bool   | Whether this is the last result of the current session    |
| is_finish     | bool   | Whether this is the last result of the current connection |

---

## 2.16 ASR Error Codes

| Error Code | Description                                   |
| ---------- | --------------------------------------------- |
| 10000      | Parameter validation failed                   |
| 10002      | Engine service error                          |
| 10003      | Failed to get intermediate recognition result |
| 10004      | Failed to get final recognition result        |
| 10005      | Engine data parsing error                     |
| 10006      | Internal engine error                         |
| 10007      | NLU request error                             |
| 10008      | Audio too long                                |

---

# 3. TTS: Audio Generation

## 3.1 Document Location

Document Center / API Documentation / TTS / Audio Generation

## 3.2 Capability Name

Audio Generation

## 3.3 Updated At

2026-04-22 06:01:19

---

## 3.4 Service Description

The TTS capability converts uploaded single-sentence text into spoken audio.

---

## 3.5 Interface Description

The speech synthesis streaming interface converts text into audio.

It is provided through a WebSocket API.

The WebSocket API supports streaming transmission and is suitable for services requiring streaming data.

Compared with SDKs, this API is lightweight and cross-language.

Compared with HTTP APIs, WebSocket has native cross-origin support.

---

## 3.6 Interface Requirements

| Item                 | Description                                     |
| -------------------- | ----------------------------------------------- |
| Protocol             | wss                                             |
| Domain               | wss://api-ai.vivo.com.cn                        |
| Request line         | GET /tts HTTP/1.1                               |
| Authentication       | Signature mechanism, see authentication section |
| Character encoding   | UTF8                                            |
| Response format      | JSON                                            |
| Development language | Any language capable of WebSocket requests      |
| OS                   | Any                                             |
| Audio properties     | 24kHz, 16-bit, mono                             |
| Audio format         | pcm                                             |
| Text length          | Unlimited                                       |

---

## 3.7 Endpoint

wss://api-ai.vivo.com.cn/tts

---

## 3.8 TTS Synthesis Flow

1. The client establishes a WebSocket connection with the server.
2. The client sends text synthesis request information.
3. The server returns PCM data approximately every 100 ms.
4. When one synthesis task ends, the client may continue sending more synthesis requests.
5. The client closes the WebSocket connection.

---

## 3.9 TTS Headers

| Header                 | Type   | Required | Value           |
| ---------------------- | ------ | -------- | --------------- |
| Authorization          | String | yes      | Bearer AppKey   |
| X-AI-GATEWAY-SIGNATURE | String | yes      | developers-aigc |

---

## 3.10 TTS URL Parameters

| Parameter       | Type   | Required | URL Encode | Description                                                   | Default   |
| --------------- | ------ | -------- | ---------- | ------------------------------------------------------------- | --------- |
| engineid        | string | yes      | yes        | Selects synthesis capability                                  |           |
| system_time     | int    | yes      | yes        | Current timestamp in seconds                                  |           |
| user_id         | string | yes      | yes        | 32-character user ID, including numbers and lowercase letters |           |
| model           | string | yes      | yes        | External phone model                                          | "unknown" |
| product         | string | yes      | yes        | Internal device model                                         | "unknown" |
| package         | string | yes      | yes        | App package name                                              | "unknown" |
| client_version  | string | yes      | yes        | App version                                                   | "unknown" |
| system_version  | string | yes      | yes        | Phone system version                                          | "unknown" |
| sdk_version     | string | yes      | yes        | SDK version                                                   | "unknown" |
| android_version | string | yes      | yes        | Android system version                                        | "unknown" |
| requestId       | uuid   | yes      | yes        | UUID                                                          |           |

---

## 3.11 TTS `engineid` Options

| engineid                    | Meaning               |
| --------------------------- | --------------------- |
| short_audio_synthesis_jovi  | Short audio synthesis |
| long_audio_synthesis_screen | Long audio synthesis  |
| tts_humanoid_lam            | Humanoid voice        |

Notes:

Short audio synthesis is suitable for dialogue scenarios, such as voice assistants.

Long audio synthesis is suitable for long text scenarios, such as novel reading or screen reading.

---

## 3.12 Handshake Result Codes

| Error Code | Meaning                                                                                      | Description                                              |
| ---------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 0          | Success. WebSocket returns data. After receiving this message, the client can send text data | {"error_code":0, "error_msg":"connect success"}          |
| 10000      | Missing request parameter or signature error. Returned over HTTP with status 400             | {"error_code":10000, "error_msg":"package not exist"}    |
| 10001      | Failed to upgrade to WebSocket protocol. Returned over HTTP with status 400                  | {"error_code":10001, "error_msg":"failed to upgrade ws"} |

---

## 3.13 Text Synthesis Request

The request body is a JSON string.

| Parameter | Type   | Required | Description                                                                    | Example                       |
| --------- | ------ | -------- | ------------------------------------------------------------------------------ | ----------------------------- |
| aue       | int    | yes      | Audio format. 0 = PCM, 1 = OPUS compressed                                     | "aue": 0                      |
| auf       | string | yes      | Audio sample rate. `audio/L16;rate=24000` means 24kHz audio                    | "auf": "audio/L16;rate=24000" |
| vcn       | string | yes      | Voice character                                                                | "vcn": "yige"                 |
| speed     | int    | no       | Speech speed, range [0-100], default 50                                        | "speed": 50                   |
| volume    | int    | no       | Volume, range [1-100], default 50                                              | "volume": 50                  |
| text      | string | yes      | Text content, base64 encoded. Before base64 encoding, max length is 2048 bytes |                               |
| encoding  | string | yes      | Text encoding, always utf8                                                     | "encoding": "utf8"            |
| reqId     | long   | yes      | Request ID                                                                     | "reqId": 513722013            |

---

## 3.14 TTS Voice Options

### For `short_audio_synthesis_jovi`

| vcn        | Voice |
| ---------- | ----- |
| vivoHelper | 奕雯    |
| yunye      | 云野-温柔 |
| wanqing    | 婉清-御姐 |
| xiaofu     | 晓芙-少女 |
| yige_child | 小萌-女童 |
| yige       | 依格    |
| yiyi       | 依依    |
| xiaoming   | 小茗    |

### For `long_audio_synthesis_screen`

| vcn           | Voice |
| ------------- | ----- |
| x2_vivoHelper | 奕雯    |
| x2_yige       | 依格-甜美 |
| x2_yige_news  | 依格-稳重 |
| x2_yunye      | 云野-温柔 |
| x2_yunye_news | 云野-稳重 |
| x2_M02        | 怀斌-浑厚 |
| x2_M05        | 兆坤-成熟 |
| x2_M10        | 亚恒-磁性 |
| x2_F163       | 晓云-稳重 |
| x2_F25        | 倩倩-清甜 |
| x2_F22        | 海蔚-大气 |
| x2_F82        | 英文女声  |

### For `tts_humanoid_lam`

| vcn           | Voice |
| ------------- | ----- |
| F245_natural  | 知性柔美  |
| M24           | 俊朗男声  |
| M193          | 理性男声  |
| GAME_GIR_YG   | 游戏少女  |
| GAME_GIR_MB   | 游戏萌宝  |
| GAME_GIR_YJ   | 游戏御姐  |
| GAME_GIR_LTY  | 电台主播  |
| YIGEXIAOV     | 依格    |
| FY_CANTONESE  | 粤语    |
| FY_SICHUANHUA | 四川话   |
| FY_MIAOYU     | 苗语    |

---

## 3.15 TTS Response Fields

| Field         | Type   | Description                                                             |
| ------------- | ------ | ----------------------------------------------------------------------- |
| error_code    | int    | Return code. 0 means success                                            |
| error_msg     | string | Description                                                             |
| sid           | string | ID of each text segment, returned only in the first frame               |
| ver           | string | Engine version, for example 221010103                                   |
| data          | object | Response data                                                           |
| data.audio    | string | Synthesized audio segment, base64 encoded                               |
| data.status   | int    | Audio stream status. 0 = first frame, 1 = synthesizing, 2 = final frame |
| data.progress | int    | Synthesis progress                                                      |
| data.slice    | int    | Frame index                                                             |

---

## 3.16 TTS Response Example

{
"ver": "121101005",
"error_msg": "success",
"req_id": 0,
"error_code": 0,
"sid": "e2122ae692f9862e58ba065d3394bd9b",
"data": {
"status": 2,
"progress": "2-2",
"hit": 0,
"audio": "DF3RDSF35SDA==",
"slice": 1
}
}

---

## 3.17 TTS Error Codes

| Error Code | Description                                   | Handling                               |
| ---------- | --------------------------------------------- | -------------------------------------- |
| 10010      | Sent data is not JSON                         | Send data in JSON format               |
| 10011      | Missing required parameters when sending text | Check parameters                       |
| 10012      | Signature error when sending text             | Check signature algorithm              |
| 10030      | Error sending text to engine                  | Connection error with engine server    |
| 10031      | Error getting audio data                      | Connection error with engine server    |
| 10032      | No available engine server                    | Check whether engine server is running |
| 11001      | Load too high, rejecting new requests         |                                        |
| 11002      | Request header protocol error                 |                                        |
| 11003      | Parameter error when setting synthesis text   |                                        |
| 11004      | Parameter error when getting audio data       |                                        |
| 11005      | Duplicate session                             |                                        |
| 11006      | Session not found when getting data           |                                        |
| 11007      | Engine creation error                         |                                        |
| 11008      | Error getting data from algorithm engine      |                                        |
| 11009      | OPUS compression error                        |                                        |
| 11010      | Invalid synthesis text                        |                                        |

---

## 3.18 Official TTS Example Notes

The official example uses:

* `websocket.create_connection`
* `ABNF`
* `uuid`
* `time`
* `base64`
* `json`
* `os`
* `IntEnum`

Core flow:

1. Read `app_id` and `app_key` from parameters or environment variables.
2. Build the WebSocket URL.
3. Add `Authorization: Bearer AppKey` in headers.
4. Establish WebSocket connection.
5. Send a JSON text synthesis request.
6. Receive base64 audio frames from the server.
7. Decode each `data.audio` frame and concatenate PCM bytes.
8. When `data.status == 2`, synthesis is complete.

---

## 3.19 PCM to WAV Conversion

The official example provides a PCM-to-WAV helper.

Default parameters:

channels = 1
bits = 16
sample_rate = 24000

Core flow:

1. Create a BytesIO buffer.
2. Open it as a WAV file.
3. Set channel count.
4. Set sample width.
5. Set sample rate.
6. Write PCM bytes.
7. Return the WAV file-like object.

---

# 4. Function Calling

## 4.1 Document Location

Document Center / API Documentation / Text Generation / Function calling

## 4.2 Capability Name

Function calling

## 4.3 Updated At

2026-03-16 07:52:35

---

## 4.4 Basic Concept

When directly calling the API, the developer needs to manually construct the `system` prompt and parse returned data.

Function calling uses `messages`.

`messages` is a list containing one or more message objects.

Each message object has two fields:

| Field   | Meaning         |
| ------- | --------------- |
| role    | Message role    |
| content | Message content |

---

## 4.5 Message Roles

| Role      | Meaning                                                                                                                                        | Example                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| system    | System role. Can specify persona, response format, API descriptions, extra knowledge, or any information the model should know                 | “You are BlueLM XiaoV. Reply in a cute girl style.”                                      |
| user      | User input                                                                                                                                     | “Hello”                                                                                  |
| assistant | Model response. Function calls are also returned by this role                                                                                  | [{"name":"get_current_weather","parameters":{"location":"Hangzhou","format":"celsius"}}] |
| function  | Function call result. If the model outputs a function call, the developer should provide the function result back to the model using this role | “Hangzhou weather is sunny, 27°C.”                                                       |

---

## 4.6 Full Function Calling Message Flow

Typical flow:

1. `system`: provides the assistant behavior, available API definitions, and output format rules.
2. `user`: asks a question.
3. `assistant`: returns a function call if a tool is needed.
4. Developer executes the function.
5. `function`: sends the function result back to the model.
6. `assistant`: produces the final natural-language response.

---

## 4.7 System Prompt Composition

A basic function calling system prompt contains:

1. Role and capability description.
2. API definitions.
3. Output format instructions.

The documentation says lines 3-12 are fixed format and are recommended to remain consistent.

The output format instruction is critical.

Without specifying the return format, the developer cannot reliably determine whether the model is calling a function or giving a normal answer.

---

## 4.8 Additional Knowledge Format

If extra information needs to be provided to the model, it can be placed in the role and function description area using a knowledge block.

Example structure:

User information: <Knowledge>
Name: Xiaobai
Age: 33
Hobbies: reading, running </Knowledge>

---

## 4.9 API Definition Format

APIs are recommended to be defined in JSON format.

Reasons:

1. Most training data uses JSON API definitions, so this format better matches model behavior.
2. JSON API definitions are widely used by OpenAI, Claude, Zhipu, and other platforms, making interface switching or dataset construction easier.

---

## 4.10 Required API Definition Fields

Each API definition must contain three required fields:

| Field       | Meaning                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| name        | API name. The model will use this name when returning a function call                                                                             |
| description | API description. It should explain the API’s function, usage constraints, and examples if needed                                                  |
| parameters  | API parameters. The core field is `properties`, which contains parameter names, types, and descriptions. `required` specifies required parameters |

---

## 4.11 Example API Definition

{
"name": "get_current_weather",
"description": "Get the current weather",
"parameters": {
"type": "object",
"properties": {
"location": {
"type": "string",
"description": "The city and state, e.g. San Francisco, CA"
},
"format": {
"type": "string",
"enum": ["celsius", "fahrenheit"],
"description": "The temperature unit to use. Infer this from the user's location."
}
},
"required": ["location", "format"]
}
}

---

# 5. Integration Notes for This Project

## 5.1 Voice Input

Use ASR when the user speaks to the app.

Expected role:

Speech audio → ASR → recognized text → app logic or LLM reasoning

ASR should be used for commands such as:

* next step
* start timer
* repeat video
* ask a cooking-related question
* casual chat

---

## 5.2 Voice Output

Use TTS when the app needs to speak to the user.

Expected role:

Text response → TTS → playable audio

TTS can be used for:

* reading the next cooking step
* answering user questions aloud
* confirming voice commands
* giving timer or cooking reminders

---

## 5.3 Tool-Oriented Reasoning

Use Function Calling when the model needs to decide whether to call a tool.

Possible project tools may include:

* start_timer
* pause_timer
* seek_video
* replay_step
* next_step
* previous_step
* explain_ingredient
* answer_recipe_question

The model should return a function call only when an actual tool action is needed. Otherwise, it should answer directly.

---

## 5.4 Authentication

All direct calls to vivo AIGC APIs must use:

Authorization: Bearer AppKey

TTS additionally requires:

X-AI-GATEWAY-SIGNATURE: developers-aigc

Do not hardcode real credentials in source code.
