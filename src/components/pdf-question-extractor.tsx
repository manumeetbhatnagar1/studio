'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { extractTextFromImageAction } from '@/app/actions';
import { LoaderCircle, UploadCloud, Scissors, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { FormLabel } from './ui/form';

// Configure pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type PdfQuestionExtractorProps = {
  onTextExtracted: (text: string) => void;
};

type Crop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export default function PdfQuestionExtractor({ onTextExtracted }: PdfQuestionExtractorProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPageNumber(1);
      setCrop(null);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pageCanvasRef.current) return;
    setIsCropping(true);
    const { left, top } = e.currentTarget.getBoundingClientRect();
    setCrop({ x: e.clientX - left, y: e.clientY - top, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isCropping || !crop) return;
    const { left, top } = e.currentTarget.getBoundingClientRect();
    const currentX = e.clientX - left;
    const currentY = e.clientY - top;
    setCrop({
      ...crop,
      width: currentX - crop.x,
      height: currentY - crop.y,
    });
  };

  const handleMouseUp = () => {
    setIsCropping(false);
  };

  const handleExtractText = async () => {
    if (!crop || !pageCanvasRef.current || crop.width === 0 || crop.height === 0) {
      toast({ variant: 'destructive', title: 'Invalid Crop', description: 'Please select an area on the PDF page.' });
      return;
    }
    setIsExtracting(true);
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if(!tempCtx) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not process image.' });
        setIsExtracting(false);
        return;
    }

    const sourceCanvas = pageCanvasRef.current;
    
    // Handle negative width/height from dragging right-to-left or bottom-to-top
    const cropX = crop.width > 0 ? crop.x : crop.x + crop.width;
    const cropY = crop.height > 0 ? crop.y : crop.y + crop.height;
    const cropWidth = Math.abs(crop.width);
    const cropHeight = Math.abs(crop.height);

    tempCanvas.width = cropWidth;
    tempCanvas.height = cropHeight;
    tempCtx.drawImage(sourceCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    
    const imageDataUri = tempCanvas.toDataURL('image/png');
    
    const result = await extractTextFromImageAction({ imageDataUri });

    if (result.error) {
      toast({ variant: 'destructive', title: 'Extraction Failed', description: result.error });
    } else {
      onTextExtracted(result.extractedText);
      toast({ title: 'Text Extracted', description: 'The question field has been populated.' });
    }
    setIsExtracting(false);
  };

  const onPageRenderSuccess = () => {
    // pdf.js renders to a canvas, we want to get a reference to it.
    const canvas = canvasContainerRef.current?.querySelector('canvas');
    if (canvas) {
      pageCanvasRef.current = canvas;
    }
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <Scissors className="w-6 h-6" />
            Extract Question from PDF
        </CardTitle>
        <CardDescription>Upload a PDF, select an area, and extract the question text automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 p-4 border-2 border-dashed rounded-lg">
            <UploadCloud className="w-8 h-8 text-muted-foreground" />
            <div className='flex-1'>
                <FormLabel htmlFor='pdf-upload'>Upload PDF</FormLabel>
                <Input id="pdf-upload" type="file" accept="application/pdf" onChange={onFileChange} className='border-none p-0 h-auto file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90' />
            </div>
        </div>

        {file && (
          <div className="border rounded-lg p-4 space-y-4">
            <div 
              ref={canvasContainerRef}
              className="relative w-full overflow-auto max-h-[600px] border" 
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp} // Stop cropping if mouse leaves area
            >
              <Document file={file} onLoadSuccess={onDocumentLoadSuccess} onLoadError={console.error}>
                <Page pageNumber={pageNumber} onRenderSuccess={onPageRenderSuccess} />
              </Document>
              {crop && (
                <div
                  className="absolute border-2 border-dashed border-destructive bg-destructive/20"
                  style={{ 
                      left: crop.width > 0 ? crop.x : crop.x + crop.width, 
                      top: crop.height > 0 ? crop.y : crop.y + crop.height, 
                      width: Math.abs(crop.width), 
                      height: Math.abs(crop.height) 
                  }}
                />
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setPageNumber(p => Math.max(p - 1, 1))} disabled={pageNumber <= 1}>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <p className="text-sm text-muted-foreground">
                  Page {pageNumber} of {numPages}
                </p>
                <Button variant="outline" size="icon" onClick={() => setPageNumber(p => Math.min(p + 1, numPages!))} disabled={pageNumber >= (numPages || 1)}>
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
              <Button onClick={handleExtractText} disabled={isExtracting || !crop}>
                {isExtracting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                Extract Text
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
