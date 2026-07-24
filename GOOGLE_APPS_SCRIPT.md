# Google Apps Script for DOST Region V QMS-F4 Google Docs Auto-Filler

This Google Apps Script automatically accepts form submissions from your Vercel WebApp, creates a new Google Doc from your `QMS-F4 Customer Satisfaction Feedback` template, fills out all placeholders (ratings, text, comments), embeds the drawn Digital Signature image, and saves the file in your Google Drive.

## Setup Instructions (2 minutes)

1. Open [Google Drive](https://drive.google.com) and create a Google Doc template named **`QMS-F4 Customer Satisfaction Feedback Template`**.
2. Copy your template File ID from the browser URL (`https://docs.google.com/document/d/YOUR_TEMPLATE_ID/edit`).
3. Go to [script.google.com](https://script.google.com) and click **New Project**.
4. Replace the code with the script below and update `TEMPLATE_DOC_ID` and `DESTINATION_FOLDER_ID`.
5. Click **Deploy > New Deployment**.
6. Select **Web app**:
   - **Execute as**: *Me*
   - **Who has access**: *Anyone*
7. Copy the **Web App URL**.
8. Set `GOOGLE_WEBHOOK_URL` in your Vercel project environment variables to this Web App URL.

---

## Google Apps Script Code (`Code.gs`)

```javascript
const TEMPLATE_DOC_ID = 'YOUR_GOOGLE_DOC_TEMPLATE_ID_HERE';
const DESTINATION_FOLDER_ID = 'YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE'; // Optional, leave blank for root

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Make a copy of the base template document
    const templateFile = DriveApp.getFileById(TEMPLATE_DOC_ID);
    const folder = DESTINATION_FOLDER_ID ? DriveApp.getFolderById(DESTINATION_FOLDER_ID) : DriveApp.getRootFolder();
    const docName = `CSF Response - ${data.serviceTitle || 'Anonymous'} - ${new Date().toISOString().split('T')[0]}`;
    const newDocFile = templateFile.makeCopy(docName, folder);
    const doc = DocumentApp.openById(newDocFile.getId());
    const body = doc.getBody();

    // Replace text placeholders
    body.replaceText('{{SERVICE_TITLE}}', data.serviceTitle || 'N/A');
    body.replaceText('{{DATE}}', data.date || new Date().toLocaleDateString());
    body.replaceText('{{VENUE}}', data.venue || 'DOST Region V');
    body.replaceText('{{NAME}}', data.name || 'Anonymous');
    body.replaceText('{{INSTITUTION}}', data.institution || 'N/A');
    body.replaceText('{{OTHER_CRITERIA}}', data.otherCriteria || 'None');
    body.replaceText('{{REASON}}', data.reason || 'None specified');
    body.replaceText('{{COMMENTS}}', data.comments || 'None');
    body.replaceText('{{INFO_SOURCES}}', (data.infoSource || []).join(', '));
    body.replaceText('{{PREFERRED_SOURCE}}', data.preferredSource || 'None');

    // Replace rating scores
    const ratings = data.ratings || {};
    body.replaceText('{{SCORE_APPROPRIATENESS}}', ratings.appropriateness || 'N/A');
    body.replaceText('{{SCORE_BENEFICIAL}}', ratings.beneficial || 'N/A');
    body.replaceText('{{SCORE_TIMELINESS}}', ratings.timeliness || 'N/A');
    body.replaceText('{{SCORE_ATTITUDE}}', ratings.attitude || 'N/A');
    body.replaceText('{{SCORE_GENDER}}', ratings.gender || 'N/A');
    body.replaceText('{{SCORE_OVERALL}}', ratings.overall || 'N/A');

    // Insert Signature Image if provided
    if (data.signature && data.signature.startsWith('data:image')) {
      const base64Data = data.signature.split(',')[1];
      const imageBlob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/png', 'signature.png');
      
      const sigPlaceholder = body.findText('{{SIGNATURE_IMAGE}}');
      if (sigPlaceholder) {
        const el = sigPlaceholder.getElement();
        el.setText('');
        const img = el.getParent().asParagraph().appendInlineImage(imageBlob);
        img.setWidth(160);
        img.setHeight(60);
      }
    } else {
      body.replaceText('{{SIGNATURE_IMAGE}}', data.name || 'Digitally Signed');
    }

    doc.saveAndClose();

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      docId: newDocFile.getId(),
      docUrl: newDocFile.getUrl()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
```
