#!/bin/bash
cd "$(dirname "$0")"
source .venv/bin/activate
python app/http_server.py
