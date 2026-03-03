# Lakehouse Mirror

A web application to mirror Microsoft Fabric lakehouses using schema shortcuts. This tool allows you to replicate the structure of one lakehouse to another by creating schema shortcuts that point to the original tables.

## Features

- **Entra ID Authentication**: Secure login using Microsoft Entra ID
- **Workspace Management**: Browse and search Microsoft Fabric workspaces
- **Lakehouse Selection**: Select source and destination lakehouses with search functionality
- **Schema Mirroring**: Create schema shortcuts to efficiently mirror lakehouse structures
- **Validation**: Compare source and destination lakehouses and generate difference reports
- **Real-time Updates**: Monitor mirroring progress and status

## Architecture

- **Frontend**: React with Material-UI and MSAL for authentication
- **Backend**: Node.js/Express API for Microsoft Fabric integration
- **Authentication**: Microsoft Authentication Library (MSAL) with Entra ID
- **APIs**: Microsoft Fabric REST API

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Azure AD App Registration with appropriate permissions
- Access to Microsoft Fabric workspaces

## Setup

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd lakehouse-mirror
   npm run install:all
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your Azure AD app registration details
   ```

3. **Azure AD App Registration Permissions**:
   Your app registration needs the following API permissions:
   - `https://api.fabric.microsoft.com/Item.ReadWrite.All`
   - `https://api.fabric.microsoft.com/Workspace.ReadWrite.All`
   - `User.Read` (Microsoft Graph)

## Usage

### Development

1. **Start the application**:
   ```bash
   npm run dev
   ```
   This will start both the backend API (port 3001) and frontend (port 3000).

2. **Access the application**:
   Open http://localhost:3000 in your browser.

### Production

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Start the production server**:
   ```bash
   npm start
   ```

### Docker

#### Quick Deploy (Recommended)

1. **Windows**: Run the deployment script:
   ```cmd
   scripts\deploy.bat
   ```

2. **Linux/Mac**: Run the deployment script:
   ```bash
   chmod +x scripts/deploy.sh
   ./scripts/deploy.sh
   ```

#### Manual Docker Commands

1. **Build Docker image**:
   ```bash
   docker build -t lakehouse-mirror .
   ```

2. **Run Docker container**:
   ```bash
   docker run -d --name lakehouse-mirror-app -p 3000:3001 --env-file .env lakehouse-mirror
   ```

#### Docker Compose

1. **Production (default)**:
   ```bash
   docker-compose up -d
   ```

2. **Development mode**:
   ```bash
   docker-compose --profile dev up -d lakehouse-mirror-dev
   ```

3. **With Redis and Nginx**:
   ```bash
   docker-compose --profile redis --profile nginx up -d
   ```

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `CLIENT_ID` | Azure AD App Registration Client ID | `c8226c02-083f-4eab-bf3f-7557e0e87108` |
| `CLIENT_SECRET` | Azure AD App Registration Client Secret | `kgE8Q~Igd-TfJ8i...` |
| `TENANT_ID` | Azure AD Tenant ID | `1c5ba771-bf8f-4578-bce4-0b57671e5b74` |
| `PORT` | Backend API port | `3001` |
| `CLIENT_PORT` | Frontend port | `3000` |

## How It Works

1. **Authentication**: Users log in using their Entra ID credentials
2. **Workspace Selection**: Browse and select source and destination workspaces
3. **Lakehouse Selection**: Choose source and destination lakehouses
4. **Mirroring**: Create schema shortcuts from destination to source lakehouse tables
5. **Validation**: Compare both lakehouses and generate a differences report

## API Endpoints

### Authentication
- `POST /api/auth/token` - Exchange authorization code for access token
- `POST /api/auth/refresh` - Refresh access token using refresh token
- `GET /api/auth/me` - Get current user information
- `POST /api/auth/logout` - Logout user (invalidate token)
- `GET /api/auth/config` - Get MSAL configuration for client

### Workspaces
- `GET /api/workspaces` - List all workspaces
- `GET /api/workspaces/search?q=term` - Search workspaces
- `GET /api/workspaces/:id` - Get workspace details
- `GET /api/workspaces/:id/lakehouses` - List lakehouses in workspace

### Lakehouses
- `GET /api/lakehouses/:id` - Get lakehouse details
- `GET /api/lakehouses/:id/tables` - List tables in lakehouse
- `GET /api/lakehouses/:id/schemas` - List schemas in lakehouse
- `GET /api/lakehouses/:id/shortcuts` - List shortcuts in lakehouse
- `GET /api/lakehouses/search` - Search lakehouses across workspaces

### Mirroring
- `POST /api/mirror/schema-shortcuts` - Create schema shortcuts
- `GET /api/mirror/status/:id` - Get mirroring job status
- `GET /api/mirror/jobs` - Get all user jobs
- `DELETE /api/mirror/jobs/:id` - Cancel or delete job

### Validation
- `POST /api/validation/compare-lakehouses` - Compare lakehouses
- `GET /api/validation/status/:id` - Get validation job status  
- `GET /api/validation/report/:id` - Get detailed validation report
- `GET /api/validation/jobs` - Get all validation jobs

## Troubleshooting

### Authentication Issues
- Ensure your Azure AD app has the correct redirect URI configured
- Verify API permissions are granted and admin consent provided
- Check that the tenant ID matches your organization

### API Connectivity
- Verify network access to Microsoft Fabric APIs
- Check authentication tokens are not expired
- Ensure workspace permissions allow access to lakehouses

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions, please create an issue in the repository or contact your system administrator.