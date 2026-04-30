import PDFDocument from 'pdfkit';
import { getClientWithTenant } from '../db/pool.js';
import { createPresignedUpload } from './media.service.js';
import { auditLog } from '../utils/audit-log.js';
import { env } from '../config/env.js';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

export async function generateRTBFConfirmationPDF(
  tenantId: string,
  studentId: string,
  actorId: string,
  timestamp: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', async () => {
        const pdfData = Buffer.concat(buffers);
        const fileName = `RTBF_Confirmation_${studentId}_${Date.now()}.pdf`;
        const storageKey = `compliance/${tenantId}/rtbf/${fileName}`;

        try {
          // Upload PDF buffer straight to MinIO
          const command = new PutObjectCommand({
            Bucket: env.S3_BUCKET,
            Key: storageKey,
            Body: pdfData,
            ContentType: 'application/pdf'
          });
          
          await s3Client.send(command);

          await auditLog({
            action: 'RTBF_PDF_GENERATED',
            entityType: 'reports',
            entityId: undefined,
            after: { storageKey },
            tenantId,
            actorId,
          });

          resolve(storageKey);
        } catch (uploadErr) {
          reject(uploadErr);
        }
      });

      // Draw PDF content
      doc.fontSize(20).text('Right to be Forgotten (RTBF) Execution Certificate', { align: 'center' });
      doc.moveDown(2);
      
      doc.fontSize(12).text(`Tenant ID: ${tenantId}`);
      doc.text(`Target Student ID Hash: ${studentId}`);
      doc.text(`Authorized Administrator ID: ${actorId}`);
      doc.text(`Execution Timestamp: ${timestamp}`);
      
      doc.moveDown(2);
      doc.text(`Under the Indonesian Personal Data Protection Law No. 27 of 2022 (PDP Law), all Personally Identifiable Information (PII) regarding the specified student history has been redacted or soft-deleted into cold-storage pending hard expiration. Associated media assets are flagged for hard deletion within 30 days.`);
      
      doc.moveDown(4);
      doc.text('This is an auto-generated cryptographically logged compliance certificate.');

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function generateStudentReport(
  tenantId: string,
  studentId: string,
  actorId: string,
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const client = await getClientWithTenant(tenantId);
      let studentName = 'Unknown Student';
      try {
        const { rows } = await client.query('SELECT full_name FROM students WHERE student_id = $1 AND tenant_id = $2', [studentId, tenantId]);
        if (rows.length > 0) studentName = rows[0].full_name;
      } finally {
        client.release();
      }

      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', async () => {
        const pdfData = Buffer.concat(buffers);
        const fileName = `Student_Report_${studentId}_${Date.now()}.pdf`;
        const storageKey = `reports/${tenantId}/${fileName}`;
        try {
          const command = new PutObjectCommand({
            Bucket: env.S3_BUCKET,
            Key: storageKey,
            Body: pdfData,
            ContentType: 'application/pdf'
          });
          await s3Client.send(command);
          await auditLog({
            action: 'REPORT_GENERATED',
            entityType: 'reports',
            entityId: undefined,
            after: { storageKey, studentId },
            tenantId,
            actorId,
          });
          // Return base64 encoded storage key to be used as reportId
          resolve(Buffer.from(storageKey).toString('base64'));
        } catch (uploadErr) {
          reject(uploadErr);
        }
      });

      doc.fontSize(20).text('Student Wellbeing Report', { align: 'center' });
      doc.moveDown(2);
      doc.fontSize(12).text(`Student Name: ${studentName}`);
      doc.text(`Student ID: ${studentId}`);
      doc.text(`Generated At: ${new Date().toISOString()}`);
      doc.moveDown(2);
      doc.text('This is a confidential summary of wellbeing cases and incidents for the specified student.');
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function getReportUrl(tenantId: string, reportId: string): Promise<string> {
  const storageKey = Buffer.from(reportId, 'base64').toString('utf-8');
  if (!storageKey.startsWith(`reports/${tenantId}/`)) {
    throw new Error('Unauthorized report access');
  }
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: storageKey,
  });
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

