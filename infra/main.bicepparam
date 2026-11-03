using './main.bicep'

param location = 'westus2'
param resourceGroupName = 'rg-jumplab'
param siteName = 'swa-jumplab'

// Add 'jumplab.tonybox.guru' once its Route 53 CNAME points at the site's default hostname.
param customDomains = []
