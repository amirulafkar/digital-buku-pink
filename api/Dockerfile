# API image for the free-tier demo (Render). Build context is this folder (api/).
#   docker build -t dbp-api -f api/Dockerfile api
# No secrets here: connection string, Auth__Key and Auth__CodePepper are environment variables set on the host. No seed runs in this image.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Api/Api.csproj Api/
COPY Data/Data.csproj Data/
RUN dotnet restore Api/Api.csproj
COPY Api/ Api/
COPY Data/ Data/
RUN dotnet publish Api/Api.csproj -c Release -o /app --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .
# Hosting__TrustForwardedHeaders is deliberately NOT set here: trusting X-Forwarded-For is a deployment choice (a Render env var).
ENV ASPNETCORE_HTTP_PORTS=8080 \
    ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
# The base image ships a non-root user named "app".
USER app
ENTRYPOINT ["dotnet", "Api.dll"]
