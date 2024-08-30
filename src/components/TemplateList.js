import React, { useEffect, useState } from 'react';
import { getStorage, ref, listAll, getDownloadURL } from "firebase/storage";
import { db } from '../firebase/firebase';
import { gemini } from '../firebase/gemini';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';
import styled, { keyframes } from 'styled-components';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';

const { GoogleGenerativeAI } = require("@google/generative-ai");

const TemplatesList = () => {
  const [templates, setTemplates] = useState([]);
  const [responseText, setResponseText] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateDetails, setTemplateDetails] = useState('');
  const [isLoading, setIsLoading] = useState(false); // New loading state

  const genAI = new GoogleGenerativeAI(gemini);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  useEffect(() => {
    const fetchTemplates = async () => {
      const storage = getStorage();
      const listRef = ref(storage, 'uploads/');
      
      try {
        const res = await listAll(listRef);
        const templatesData = await Promise.all(
          res.items.map(async (itemRef) => {
            const url = await getDownloadURL(itemRef);
            return {
              id: itemRef.name,
              name: itemRef.name,
              url: url,
            };
          })
        );
        
        setTemplates(templatesData);
      } catch (error) {
        console.error("Error fetching templates:", error);
      }
    };

    fetchTemplates();
  }, []);

  const extractTextFromDOCX = async (arrayBuffer) => {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  const extractTextFromPDF = async (arrayBuffer) => {
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return text;
  };

  const handleTemplateClick = async (template) => {
    try {
      const response = await fetch(template.url);
      const arrayBuffer = await response.arrayBuffer();
      let text;

      if (template.name.endsWith('.docx')) {
        text = await extractTextFromDOCX(arrayBuffer);
      } else if (template.name.endsWith('.pdf')) {
        text = await extractTextFromPDF(arrayBuffer);
      } else {
        throw new Error('Unsupported file format');
      }

      setSelectedTemplate(text);
    } catch (error) {
      console.error("Error extracting text from template:", error);
    }
  };

  const handleDetailsSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    setIsLoading(true); // Start loading

    const prompt = `
      Convert the following text extracted from a document to LaTeX format, ensuring proper centering and formatting:
      
      Extracted text: ${selectedTemplate}
      
      Additional details: ${templateDetails}
      
      Please provide the output in LaTeX format & no extra text.
    `;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      setResponseText(text);
    } catch (error) {
      console.error("Error generating LaTeX content:", error);
      setResponseText("An error occurred while generating the LaTeX content.");
    } finally {
      setIsLoading(false); // Stop loading
    }
  };
  
  
  const generateDocx = async (latexContent) => {
    try {
      // Create a new document with at least one section
      const doc = new Document({
        creator: "LegalAppa", // Add your name or any creator's name
        title: "Generated LaTeX Content",
        description: "This document contains LaTeX content converted to DOCX.",
        sections: [
          {
            properties: {}, // Optional section properties can be added here
            children: [
              new Paragraph({
                children: [new TextRun(latexContent)],
              }),
            ],
          },
        ],
      });
  
      // Generate the DOCX file as a Blob
      const blob = await Packer.toBlob(doc);
  
      // Trigger the download of the DOCX file
      saveAs(blob, 'generated-latex-content.docx');
    } catch (error) {
      console.error('Error generating DOCX:', error);
    }
  };
    
  return (
    <Container>
      <Section>
        <Title>Available Templates</Title>
        <TemplateList>
          {templates.map(template => (
            <TemplateItem key={template.id}>
              <TemplateName>{template.name}</TemplateName>
              <Button onClick={() => handleTemplateClick(template)}>Extract and Edit</Button>
            </TemplateItem>
          ))}
        </TemplateList>
      </Section>

      {selectedTemplate && (
        <Section>
          <Title>Template Details</Title>
          <Form onSubmit={handleDetailsSubmit}>
            <TextArea
              value={templateDetails}
              onChange={(e) => setTemplateDetails(e.target.value)}
              placeholder="Enter additional details for template manipulation"
              rows={5}
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Generating...' : 'Generate LaTeX'}
            </Button>
          </Form>
        </Section>
      )}

      <Section>
        <Title>Generated LaTeX</Title>
        <button onClick={() => generateDocx(responseText)}>Generate Docx</button>
        <LaTeXOutput>{responseText}</LaTeXOutput>
      </Section>
    </Container>
  );
};

export default TemplatesList;

// Styled Components
const slideIn = keyframes`
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

const Container = styled.div`
  max-width: 800px;
  margin: 2rem auto;
  padding: 2rem;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 4rem 0;
  background: linear-gradient(135deg, #e6e6e6 50%, #f8f8f8 50%);
  clip-path: polygon(0 0, 100% 15%, 100% 100%, 0% 100%);
`;

const Section = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  color: #333;
  font-size: 1.8rem;
  margin-bottom: 1rem;
`;

const TemplateList = styled.ul`
  list-style-type: none;
  padding: 0;
`;

const TemplateItem = styled.li`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #eee;

  &:last-child {
    border-bottom: none;
  }
`;

const TemplateName = styled.h2`
  font-size: 1.2rem;
  color: #444;
  margin: 0;
`;

const Button = styled.button`
  background-color: #4a90e2;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background-color: #357abd;
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-bottom: 1rem;
  resize: vertical;
`;

const LaTeXOutput = styled.pre`
  background-color: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: monospace;
  font-size: 0.9rem;
`;