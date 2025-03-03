import React, { useState } from 'react';
import { Button, Container, Typography, Box, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Grid, Card } from '@mui/material';
import axios from 'axios';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';

const App = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [extractedData, setExtractedData] = useState(null);

  const generateExcelFile = () => {
    if (!extractedData) return;

    const workbook = XLSX.utils.book_new();
    const storeSheet = XLSX.utils.json_to_sheet([extractedData.store]);
    XLSX.utils.book_append_sheet(workbook, storeSheet, 'Store Info');
    const itemsSheet = XLSX.utils.json_to_sheet(extractedData.items);
    XLSX.utils.book_append_sheet(workbook, itemsSheet, 'Items');
    const paymentSheet = XLSX.utils.json_to_sheet([extractedData.payment]);
    XLSX.utils.book_append_sheet(workbook, paymentSheet, 'Payment');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(blob, 'receipt-details.xlsx');
  };

  const extractTextFromPDF = async (file) => {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let text = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ');
      }
      
      return text;
    } catch (err) {
      console.error('PDF parsing error:', err);
      throw new Error('Failed to parse PDF file - please check it\'s a valid PDF');
    }
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setExtractedData(null);
    setError('');
  };

  const processReceiptData = async () => {
    if (!file) {
      setError('Please upload a PDF file first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const pdfText = await extractTextFromPDF(file);
      console.log('Extracted PDF Text:', pdfText);

      console.log('Environment Variables:', process.env);
      console.log('API Key:', process.env.REACT_APP_GEMINI_API_KEY);
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${process.env.REACT_APP_GEMINI_API_KEY}`,
        {
          contents: [{
            parts: [{
              text: `ONLY OUTPUT VALID JSON. Extract receipt data using this structure:
              {
                "store": { 
                  "name": "Company name",
                  "address": "Full address",
                  "tin": "Tax Identification Number",
                  "urn": "Unique Receipt Number",
                  "serialNumber": "Serial number"
                },
                "transaction": {
                  "receiptNumber": "Receipt number",
                  "date": "Date in YYYY-MM-DD",
                  "time": "Time in HH:MM:SS",
                  "clerk": "Clerk ID",
                  "machineNumber": "Machine number"
                },
                "items": [
                  {
                    "code": "Product code",
                    "description": "Product name",
                    "quantity": "Quantity",
                    "unitPrice": "Unit price",
                    "total": "Total price"
                  }
                ],
                "payment": {
                  "bank": "Bank name",
                  "cardType": "Card type",
                  "amount": "Total amount paid",
                  "authorizationCode": "Authorization code"
                },
                "verificationCode": "Receipt verification code"
              }
              From this receipt text: ${pdfText}`
            }]
          }]
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      let responseText = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new Error('Invalid API response structure');
      }
      
      // Clean response text
      responseText = responseText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      
      const result = JSON.parse(responseText);
      setExtractedData(result);

      const workbook = XLSX.utils.book_new();
      const storeSheet = XLSX.utils.json_to_sheet([result.store]);
      XLSX.utils.book_append_sheet(workbook, storeSheet, 'Store Info');
      const itemsSheet = XLSX.utils.json_to_sheet(result.items);
      XLSX.utils.book_append_sheet(workbook, itemsSheet, 'Items');
      const paymentSheet = XLSX.utils.json_to_sheet([result.payment]);
      XLSX.utils.book_append_sheet(workbook, paymentSheet, 'Payment');

      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
      saveAs(blob, 'receipt-details.xlsx');

    } catch (err) {
      console.error('Full error details:', err);
      console.log('API Response:', err.response?.data);
      setError(err.response?.data?.message || `Failed to process receipt: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>
          Olive Receipt Processor App
        </Typography>
        
        <input
          accept="application/pdf"
          style={{ display: 'none' }}
          id="pdf-upload"
          type="file"
          onChange={handleFileChange}
        />
        <label htmlFor="pdf-upload">
          <Button variant="contained" component="span">
            Upload Receipt
          </Button>
        </label>

        {file && (
          <Typography variant="body1" sx={{ mt: 2 }}>
            Selected file: {file.name}
          </Typography>
        )}

        <Button
          variant="contained"
          color="secondary"
          sx={{ mt: 2, mb: 4 }}
          onClick={processReceiptData}
          disabled={!file || loading}
        >
          {loading ? <CircularProgress size={24} /> : 'Process Receipt'}
        </Button>

        {error && (
          <Typography color="error" sx={{ mt: 2 }}>
            Error: {error}
          </Typography>
        )}

        {extractedData && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom textAlign="center">
              Extracted Data Preview
            </Typography>
            <Grid container spacing={2} sx={{ mt: 2 }}>
              <Grid item xs={12} md={6}>
                <Card>
                  <Box p={2}>
                    <Typography variant="h6" gutterBottom>
                      Store Information
                    </Typography>
                    <Typography>
                      Name: {extractedData.store.name}
                    </Typography>
                    <Typography>
                      Address: {extractedData.store.address}
                    </Typography>
                  </Box>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card>
                  <Box p={2}>
                    <Typography variant="h6" gutterBottom>
                      Transaction Details
                    </Typography>
                    <Typography>
                      Receipt Number: {extractedData.transaction.receiptNumber}
                    </Typography>
                    <Typography>
                      Date: {extractedData.transaction.date}
                    </Typography>
                    <Typography>
                      Time: {extractedData.transaction.time}
                    </Typography>
                  </Box>
                </Card>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Items
                </Typography>
                <Grid container spacing={2}>
                  {extractedData.items.map((item, index) => (
                    <Grid item xs={12} sm={6} md={4} key={index}>
                      <Card>
                        <Box p={2}>
                          <Typography variant="subtitle1">
                            {item.description}
                          </Typography>
                          <Typography>Code: {item.code}</Typography>
                          <Typography>Quantity: {item.quantity}</Typography>
                          <Typography>Unit Price: {item.unitPrice}</Typography>
                          <Typography>Total: {item.total}</Typography>
                        </Box>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Grid>
            </Grid>
            <Box mt={2} textAlign="center">
              <Button variant="contained" color="primary" onClick={generateExcelFile}>
                Download Data
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Container>
  );
};

export default App;
