FROM python:3.11-slim

WORKDIR /app

COPY consumer/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY consumer/openmirroring_operations.py /app/openmirroring_operations.py
COPY consumer/consumer.py /app/consumer.py
COPY consumer/gtid_utils.py /app/gtid_utils.py
COPY consumer/config.yaml /app/config.yaml
COPY consumer/config.example.yaml /app/config.example.yaml

CMD ["python", "/app/consumer.py"]
