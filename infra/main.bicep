targetScope = 'subscription'

@description('Static Web Apps control-plane region. Content is served from the global edge regardless.')
@allowed(['westus2', 'centralus', 'eastus2', 'westeurope', 'eastasia'])
param location string = 'westus2'

@description('Resource group that holds the site.')
param resourceGroupName string = 'rg-jumplab'

@description('Static Web App name; becomes part of the default *.azurestaticapps.net hostname.')
param siteName string = 'swa-jumplab'

@description('Custom domains to bind. Each needs a CNAME to the default hostname before it is added, or the deployment fails validation.')
param customDomains string[] = []

param tags object = {
  workload: 'jumplab'
}

module rg 'br/public:avm/res/resources/resource-group:0.4.4' = {
  name: 'rg-${uniqueString(deployment().name)}'
  params: {
    name: resourceGroupName
    location: location
    tags: tags
  }
}

module site 'br/public:avm/res/web/static-site:0.9.6' = {
  name: 'site-${uniqueString(deployment().name)}'
  scope: resourceGroup(resourceGroupName)
  dependsOn: [rg]
  params: {
    name: siteName
    location: location
    sku: 'Free'
    // Deploys come from GitHub Actions with the deployment token, not a linked repository.
    provider: 'None'
    stagingEnvironmentPolicy: 'Disabled'
    allowConfigFileUpdates: true
    customDomains: customDomains
    tags: tags
  }
}

output resourceGroupName string = resourceGroupName
output siteName string = site.outputs.name
output defaultHostname string = site.outputs.defaultHostname
