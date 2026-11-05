$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '../../..'))
$fixture = Get-Content build/issue85/fixtures.json -Raw | ConvertFrom-Json
$base = 'http://localhost:8085/api/v1'
# Run exclusively: clear only the isolated project's Redis before verifying initial TTL.
& docker compose -p issue85 --env-file build/issue85.env -f compose.performance.yml exec -T redis redis-cli FLUSHDB | Out-Null
if ($LASTEXITCODE) { throw 'Cannot reset test Redis' }
foreach ($url in @("$base/categories", "$base/recipes?page=1", "$base/recipes/search?q=pho", "$base/recipes/$($fixture.slugs[0])")) {
    $response = Invoke-WebRequest $url -UseBasicParsing
    if ($response.StatusCode -ne 200) { throw "Prime failed" }
}
$prefix = @('compose','-p','issue85','--env-file','build/issue85.env','-f','compose.performance.yml')
$results = @()
foreach ($item in @(@('category', '*public:categories:list:*', 2700000), @('list', '*public:recipes:list:*', 180000),
    @('search', '*public:recipes:search:*', 180000), @('detail', '*public:recipes:detail:*', 3600000))) {
    $keys = & docker @prefix exec -T redis redis-cli --scan --pattern $item[1]
    if ($LASTEXITCODE -ne 0 -or !$keys) { throw "No $($item[0]) data keys" }
    # Multiple old namespaces may exist. The latest primed data key has the longest remaining TTL.
    $ttls = @($keys | ForEach-Object { [long](& docker @prefix exec -T redis redis-cli PTTL $_) })
    $actual = ($ttls | Measure-Object -Maximum).Maximum
    $expected = [long]$item[2]
    $ok = $actual -gt ($expected - 60000) -and $actual -le $expected
    $results += @{ kind = $item[0]; expectedMs = $expected; actualMs = $actual; passed = $ok }

}
$results | ConvertTo-Json | Set-Content build/issue85/ttl-summary.json
if (@($results | Where-Object { !$_.passed }).Count) { throw 'TTL mismatch; see ttl-summary.json' }
Write-Output 'Redis data TTL category/list/search/detail passed.'
