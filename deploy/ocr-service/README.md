# OpenAgent OCR Service

This service provides the OCR endpoint used by the `local_file` tool.

## API

- `GET /health`
- `POST /ocr/pdf`
  - `multipart/form-data`
  - file field: `file`
  - response: `{"text":"recognized text"}`

## Run with OpenAgent

OpenAgent starts the managed OCR service lazily on the first `local_pdf_ocr_read` call when the `local_file` tool Provider URL is empty.

The managed Python environment is created under:

```text
tmp/ocr-service/.venv
```

If the `local_file` tool Provider URL is empty, OpenAgent uses the managed endpoint by default:

```text
http://127.0.0.1:8001/ocr/pdf
```

Python 3.10+ must already be installed on the machine. OpenAgent installs the Python package dependencies into the managed virtual environment during the first managed OCR startup.

## Run with Docker

From the OpenAgent repository root:

```bash
docker compose -f docker-compose.ocr.yml up --build
```

To force OpenAgent to use the Docker service instead of the managed service, set the `local_file` tool Provider URL to:

```text
http://127.0.0.1:8001/ocr/pdf
```

## Test

```bash
curl http://127.0.0.1:8001/health
curl -F "file=@/absolute/path/to/scanned.pdf" http://127.0.0.1:8001/ocr/pdf
```
