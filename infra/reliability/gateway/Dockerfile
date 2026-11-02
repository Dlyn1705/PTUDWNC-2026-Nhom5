FROM nginx:1.28-alpine
RUN apk add --no-cache python3
COPY infra/reliability/gateway/ /gateway/
ENTRYPOINT ["python3", "/gateway/controller.py"]
