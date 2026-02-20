// Google Drive integration via Replit connector
import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-drive',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Drive not connected');
  }
  return accessToken;
}

async function getUncachableGoogleDriveClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

async function getDocsClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.docs({ version: 'v1', auth: oauth2Client });
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  createdTime?: string;
}

export interface DriveFolder {
  id: string;
  name: string;
}

export const gdriveService = {
  async listFolders(parentId?: string): Promise<DriveFolder[]> {
    const drive = await getUncachableGoogleDriveClient();
    let query = "mimeType='application/vnd.google-apps.folder' and trashed=false";
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    }
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      orderBy: 'name',
      pageSize: 100,
    });
    return (response.data.files || []).map((f: any) => ({
      id: f.id!,
      name: f.name!,
    }));
  },

  async searchFolders(name: string): Promise<DriveFolder[]> {
    const drive = await getUncachableGoogleDriveClient();
    const query = `mimeType='application/vnd.google-apps.folder' and trashed=false and name contains '${name.replace(/'/g, "\\'")}'`;
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      orderBy: 'name',
      pageSize: 50,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return (response.data.files || []).map((f: any) => ({
      id: f.id!,
      name: f.name!,
    }));
  },

  async listFiles(folderId: string): Promise<DriveFile[]> {
    const drive = await getUncachableGoogleDriveClient();
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, modifiedTime, createdTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 200,
    });
    return (response.data.files || []).map((f: any) => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType!,
      modifiedTime: f.modifiedTime!,
      createdTime: f.createdTime,
    }));
  },

  async getDocContent(fileId: string): Promise<string> {
    const docs = await getDocsClient();
    const doc = await docs.documents.get({ documentId: fileId });
    
    let text = '';
    const body = doc.data.body;
    if (body?.content) {
      for (const element of body.content) {
        if (element.paragraph?.elements) {
          for (const el of element.paragraph.elements) {
            if (el.textRun?.content) {
              text += el.textRun.content;
            }
          }
        }
        if (element.table) {
          for (const row of element.table.tableRows || []) {
            for (const cell of row.tableCells || []) {
              for (const content of cell.content || []) {
                if (content.paragraph?.elements) {
                  for (const el of content.paragraph.elements) {
                    if (el.textRun?.content) {
                      text += el.textRun.content;
                    }
                  }
                }
              }
              text += '\t';
            }
            text += '\n';
          }
        }
      }
    }
    return text;
  },

  async getFileAsText(fileId: string, mimeType: string): Promise<string> {
    if (mimeType === 'application/vnd.google-apps.document') {
      return this.getDocContent(fileId);
    }
    
    const drive = await getUncachableGoogleDriveClient();
    if (mimeType === 'application/vnd.google-apps.document') {
      const response = await drive.files.export({
        fileId,
        mimeType: 'text/plain',
      });
      return response.data as string;
    }
    
    const response = await drive.files.get({
      fileId,
      alt: 'media',
    });
    return response.data as string;
  },
};
