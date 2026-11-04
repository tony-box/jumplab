using './main.bicep'

param location = 'westus2'
param resourceGroupName = 'rg-jumplab'
param siteName = 'swa-jumplab'

// Each domain needs a CNAME (Route 53) to the site's default hostname before it is deployed.
param customDomains = [
  'jumplab.tonybox.guru'
]
