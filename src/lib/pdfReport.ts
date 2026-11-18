import { jsPDF } from 'jspdf';
import type { VoiceDetectionRecord } from '../types/voiceguard';

export function downloadDetectionPdf(record: VoiceDetectionRecord): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 44;
  const maxLineWidth = pageWidth - margin * 2;
  let y = 44;

  // Header banner
  doc.setFillColor(8, 13, 26);
  doc.rect(0, 0, pageWidth, 88, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('VOICEGUARD AI', margin, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(148, 163, 184);
  doc.text('TRUST THE VOICE. VERIFY THE SIGNAL.  |  VOICE SECURITY REPORT', margin, 56);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 56, { align: 'right' });

  y = 114;

  const badgeColor: [number, number, number] =
    record.riskLevel === 'Critical Risk' || record.riskLevel === 'High Risk'
      ? [220, 38, 38]
      : record.riskLevel === 'Medium Risk'
        ? [217, 119, 6]
        : [16, 185, 129];

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, maxLineWidth, 82, 6, 6, 'FD');

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('CLASSIFICATION', margin + 16, y + 22);
  doc.text('RISK LEVEL', margin + 210, y + 22);
  doc.text('RISK SCORE', margin + 320, y + 22);
  doc.text('AUTHENTICITY', margin + 410, y + 22);

  doc.setTextColor(badgeColor[0], badgeColor[1], badgeColor[2]);
  doc.setFontSize(12);
  doc.text(record.classification, margin + 16, y + 46);
  doc.text(record.riskLevel, margin + 210, y + 46);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.text(`${record.riskScore}/100`, margin + 320, y + 46);
  doc.text(`${record.authenticityScore}/100`, margin + 410, y + 46);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Engine: ${record.modelStatus}`, margin + 16, y + 68);

  y += 104;

  // Metadata Grid
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Detection Metadata', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  const metaRows = [
    [`Detection ID: ${record.id}`, `Session / Audio: ${record.fileName}`],
    [`Source: ${record.sourceType === 'live_recording' ? 'Live Mic Monitoring' : 'Audio File Upload'}`, `Format: ${record.fileType}`],
    [`Duration: ${record.duration.toFixed(2)} seconds`, `File Size: ${(record.fileSize / 1024).toFixed(1)} KB`],
    [`Timestamp: ${record.createdAt.toLocaleString()}`, `Calibrated Confidence: ${record.confidence !== null ? `${record.confidence}%` : 'N/A (Experimental Mode)'}`],
  ];

  for (const [left, right] of metaRows) {
    doc.text(left, margin, y);
    doc.text(right, margin + 260, y);
    y += 16;
  }

  y += 10;

  // Explanation
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Analysis Summary & Disclosure', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  const explanationLines = doc.splitTextToSize(record.explanation, maxLineWidth);
  doc.text(explanationLines, margin, y);
  y += explanationLines.length * 13 + 14;

  // Acoustic Features
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Extracted Acoustic Signal Features', margin, y);
  y += 16;

  const f = record.extractedFeatures;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  const featureRows = [
    [`RMS Energy: ${f.rmsEnergy.toFixed(5)}`, `Zero-Crossing Rate: ${f.zeroCrossingRate.toFixed(5)}`],
    [`Spectral Centroid: ${f.spectralCentroid.toFixed(1)} Hz`, `Spectral Bandwidth: ${f.spectralBandwidth.toFixed(1)} Hz`],
    [`Spectral Rolloff (85%): ${f.spectralRolloff.toFixed(1)} Hz`, `Peak Frequency: ${f.peakFrequency.toFixed(1)} Hz`],
    [`Dynamic Range: ${f.dynamicRange.toFixed(1)} dB`, `Silence Ratio: ${(f.silenceRatio * 100).toFixed(1)}%`],
    [`Modulation Variance: ${f.pitchVariance.toFixed(4)}`, `Sample Rate: ${f.sampleRate} Hz`],
  ];

  for (const [left, right] of featureRows) {
    doc.text(left, margin, y);
    doc.text(right, margin + 260, y);
    y += 16;
  }

  y += 12;

  // Recommendations
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('4. Recommended Prevention Actions', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);

  for (const rec of record.recommendations) {
    const lines = doc.splitTextToSize(`• ${rec}`, maxLineWidth);
    if (y + lines.length * 13 > 780) {
      doc.addPage();
      y = 48;
    }
    doc.text(lines, margin, y);
    y += lines.length * 13 + 6;
  }

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'VOICEGUARD AI Security Operations Report — Verify high-risk or suspicious communications independently out-of-band.',
    margin,
    812
  );

  doc.save(`voiceguard-report-${record.id}.pdf`);
}
