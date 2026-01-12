# 🚀 Deployment Guide

Deploy the Azure Data Factory to Microsoft Fabric Migration Assistant to your Azure subscription.

---

## 📋 Prerequisites

- **Azure Account** - [Create free account](https://azure.microsoft.com/free/)
- **Azure AD Application** - Required for authentication (see [Setup Guide](#azure-ad-setup))
- **GitHub Account** - For automated deployments (optional)

---

## 🎯 Recommended: Azure Static Web Apps

### Why Static Web Apps?

✅ **Perfect for this application:**
- Pure frontend React/Vite application
- No backend server required
- Free tier with generous limits (100GB bandwidth/month)
- Automatic HTTPS and custom domains
- Global CDN distribution
- Built-in CI/CD from GitHub

✅ **Zero configuration needed:**
- All Azure AD credentials entered through the UI
- No environment variables to manage
- No secrets to configure

---

## 🚀 Quick Deploy (5 Minutes)

### Option A: Azure Portal (Easiest)

1. **Click the Deploy Button:**

   [![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.StaticApp)

2. **Sign in to Azure Portal**

3. **Fill in the deployment form:**

   ```
   Basics:
   ├─ Subscription: [Select your subscription]
   ├─ Resource Group: [Create new or select existing]
   ├─ Name: pipeline-fabric-upgrader (or choose your own)
   ├─ Plan Type: Free
   └─ Region: [Select closest to you]

   GitHub Details:
   ├─ Source: GitHub
   ├─ Organization: [YOUR-GITHUB-USERNAME]
   ├─ Repository: [YOUR-REPO-NAME]
   ├─ Branch: main
   
   Build Details:
   ├─ Build Presets: Custom
   ├─ App location: /
   ├─ Api location: (leave empty)
   └─ Output location: dist
   ```

4. **Authorize GitHub Access:**
   - Azure will request read-only access to the repository
   - This is needed to deploy the code (no write access required)

5. **Click "Review + Create"** then **"Create"**

6. **Wait 2-3 minutes** for deployment to complete

7. **Get Your App URL:**
   - Go to your Static Web App resource in Azure Portal
   - Find the URL under "Overview" → "URL"
   - Example: `https://happy-ocean-12345.azurestaticapps.net`

---

### Option B: Azure CLI

```bash
# Install Azure CLI (if not already installed)
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Login to Azure
az login

# Create resource group (if needed)
az group create \
  --name pipeline-upgrader-rg \
  --location eastus2

# Create Static Web App
az staticwebapp create \
  --name pipeline-fabric-upgrader \
  --resource-group pipeline-upgrader-rg \
  --source https://github.com/[YOUR-GITHUB-USERNAME]/[YOUR-REPO-NAME] \
  --location eastus2 \
  --branch main \
  --app-location "/" \
  --output-location "dist" \
  --login-with-github

# Note: Replace [YOUR-GITHUB-USERNAME] and [YOUR-REPO-NAME] with your actual GitHub username and repository name

# Get the deployment URL
az staticwebapp show \
  --name pipeline-fabric-upgrader \
  --resource-group pipeline-upgrader-rg \
  --query "defaultHostname" \
  --output tsv
```

---

## 🔐 Azure AD Setup

Users need to configure their own Azure AD application to authenticate:

### 1. Register Azure AD Application

```bash
# Via Azure Portal:
1. Go to https://portal.azure.com
2. Navigate to: Azure Active Directory → App registrations
3. Click "New registration"
4. Configure:
   - Name: Pipeline to Fabric Upgrader
   - Supported account types: Single tenant (or as needed)
   - Redirect URI:
     * Type: Single-page application (SPA)
     * URI: https://your-app-url.azurestaticapps.net
5. Click "Register"
```

### 2. Configure API Permissions

```bash
1. In your app registration, go to "API permissions"
2. Add permissions:
   ├─ Microsoft Graph → Delegated → User.Read
   ├─ Power BI Service → Delegated → (as needed for Fabric)
   └─ Grant admin consent (if required)
```

### 3. Get Credentials

```bash
1. Go to "Overview" in your app registration
2. Copy these values:
   ├─ Application (client) ID
   └─ Directory (tenant) ID
3. These will be entered in the app UI when logging in
```

---

## 🎨 Using the Deployed App

### First-Time Setup

1. **Open your deployed app URL**

2. **On the Login Page:**
   - **Authentication Mode:** Choose between:
     - **Interactive Login** (Microsoft Account)
     - **Service Principal** (Client Secret)
   
3. **Enter Azure AD Credentials:**
   - **Tenant ID:** Your Azure AD Directory (tenant) ID
   - **Application ID:** Your Azure AD Application (client) ID
   - **Client Secret:** (Only for Service Principal mode)

4. **Click "Login"**

5. **Authenticate with Microsoft:**
   - Sign in with your Microsoft account
   - Grant permissions if prompted

6. **Start Using the App:**
   - Upload ADF ARM templates
   - Profile your pipelines
   - Map components to Fabric
   - Deploy to your Fabric workspace

### Subsequent Logins

Your credentials are saved locally (browser localStorage), so you won't need to re-enter them unless:
- You clear browser data
- You use a different browser/device
- You explicitly log out

---

## 🔄 Automatic Updates

### How It Works

- Every time updates are pushed to the `main` branch, Azure automatically:
  1. ✅ Builds the latest code
  2. ✅ Runs tests
  3. ✅ Deploys to your Static Web App
  4. ✅ Updates are live in 2-3 minutes

- **You don't need to do anything** - updates happen automatically!

### Viewing Deployment Status

```bash
# In Azure Portal:
1. Go to your Static Web App resource
2. Click "GitHub Actions" in the left menu
3. See all deployment runs and their status

# Or check GitHub:
1. Go to your repository on GitHub
2. Click "Actions" tab
3. See all workflow runs
```

---

## 🌐 Custom Domain (Optional)

### Add Your Own Domain

```bash
# Via Azure Portal:
1. Go to your Static Web App
2. Click "Custom domains" in left menu
3. Click "+ Add"
4. Enter your domain name
5. Follow DNS configuration instructions

# Domain will have automatic SSL certificate
```

---

## 💰 Cost Estimate

### Free Tier Includes:
- ✅ 100 GB bandwidth per month
- ✅ 2 custom domains
- ✅ Automatic SSL certificates
- ✅ Global CDN
- ✅ Staging environments

### Expected Cost:
- **Free Tier:** $0/month for typical usage
- **Standard Tier:** $9/month (if you exceed free tier limits)

**For most users, the free tier is sufficient.**

---

## 🔍 Troubleshooting

### Deployment Issues

**Problem:** Deployment fails in GitHub Actions
```bash
Solution:
1. Check the GitHub Actions logs
2. Verify build succeeds locally: npm run build
3. Ensure all dependencies are in package.json
```

**Problem:** Static Web App shows "Application Error"
```bash
Solution:
1. Check Azure Portal → Your Static Web App → Logs
2. Verify staticwebapp.config.json is present
3. Check that dist/ folder was created during build
```

### Application Issues

**Problem:** Can't log in with Azure AD
```bash
Solution:
1. Verify redirect URI in Azure AD matches your deployed URL
2. Check Tenant ID and Application ID are correct
3. Ensure API permissions are granted
4. Check browser console for errors
```

**Problem:** "Failed to authenticate" error
```bash
Solution:
1. Verify Azure AD application is in the correct tenant
2. Check that user has permissions to access Fabric
3. Try clearing browser cache and logging in again
```

**Problem:** Fabric API calls fail
```bash
Solution:
1. Verify user has Fabric workspace access
2. Check API permissions in Azure AD app
3. Ensure workspace ID is correct
```

---

## 🛠️ Advanced: Local Development

### Run Locally

```bash
# Clone the repository
git clone https://github.com/[YOUR-GITHUB-USERNAME]/[YOUR-REPO-NAME].git
cd [YOUR-REPO-NAME]

# Note: Replace [YOUR-GITHUB-USERNAME] and [YOUR-REPO-NAME] with your actual values

# Install dependencies
npm install

# Start development server
npm run dev

# App runs at http://localhost:5173
```

### Local Azure AD Configuration

For local development, set redirect URI to: `http://localhost:5173`

---

## 📊 Monitoring

### View Application Insights (Optional)

```bash
1. In Azure Portal, create Application Insights resource
2. Link to your Static Web App
3. View:
   ├─ Page views
   ├─ Performance metrics
   ├─ User sessions
   └─ Error logs
```

---

## 🔒 Security Best Practices

✅ **The application:**
- Runs entirely in the browser (no server-side code)
- Never stores credentials on any server
- Uses Azure AD for authentication (industry standard)
- All API calls go directly to Microsoft Fabric APIs
- Credentials are stored in browser localStorage only

✅ **Recommended:**
- Use Service Principal with limited permissions for production
- Regularly rotate client secrets
- Enable Azure AD Conditional Access policies
- Monitor sign-in logs in Azure AD

---

## 📞 Support

### Getting Help

- **Issues:** Report issues in your repository's GitHub Issues
- **Discussions:** Ask questions in your repository's GitHub Discussions
- **Documentation:** [README](README.md)

---

## 🎓 Additional Resources

- [Azure Static Web Apps Documentation](https://learn.microsoft.com/azure/static-web-apps/)
- [Azure AD App Registration Guide](https://learn.microsoft.com/azure/active-directory/develop/quickstart-register-app)
- [Microsoft Fabric Documentation](https://learn.microsoft.com/fabric/)

---

## ✅ Deployment Checklist

- [ ] Azure account created
- [ ] Resource group created (or selected)
- [ ] Static Web App deployed
- [ ] Azure AD application registered
- [ ] Redirect URI configured
- [ ] API permissions granted
- [ ] Application tested with sample ADF template
- [ ] Custom domain configured (optional)

**Need help?** Open an issue on GitHub!
