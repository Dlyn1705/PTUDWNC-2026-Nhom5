FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Culinary_Blog_Nhom5/src/ ./src/
RUN dotnet publish src/CulinaryBlog.API -c Release -o /out
FROM mcr.microsoft.com/dotnet/aspnet:10.0
RUN apt-get update && apt-get install -y --no-install-recommends curl libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out/ ./
RUN mkdir -p /app/logs && chown "$APP_UID" /app/logs && chmod 700 /app/logs
ENV ASPNETCORE_URLS=http://+:8080
USER $APP_UID
ENTRYPOINT ["dotnet", "CulinaryBlog.API.dll"]
