'use client';

import { useState, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { FileUp, Scissors, LoaderCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { extractQuestionFromImage } from '@/app/actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';

// Set up pdfjs worker from an external CDN
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfQuestionExtractorProps {
  onTextExtracted: (text: string) => void;
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number | undefined) {
    return centerCrop(
      makeAspectCrop(
        {
          unit: '%',
          width: 90,
        },
        aspect,
        mediaWidth,
        mediaHeight
      ),
      mediaWidth,
      mediaHeight
    );
}

export default function PdfQuestionExtractor({ onTextExtracted }: PdfQuestionExtractorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageImgSrc, setPageImgSrc] = useState('');
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop>();
  const [aspect] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const { toast } = useToast();

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { files } = event.target;
    if (files && files[0]) {
      setFile(files[0]);
      setNumPages(null);
      setPageNumber(1);
      setPageImgSrc('');
      setCrop(undefined);
      setCompletedCrop(undefined);
    }
  }

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  const onPageRenderSuccess = useCallback(() => {
    const canvas = document.querySelector('.react-pdf__Page__canvas') as HTMLCanvasElement;
    if (canvas) {
        setPageImgSrc(canvas.toDataURL());
    }
    setIsRendering(false);
  }, []);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, aspect));
  }

  async function handleExtractClick() {
    if (!completedCrop || !imgRef.current) {
      toast({
        variant: 'destructive',
        title: 'No Crop',
        description: 'Please select an area of the image to extract text from.',
      });
      return;
    }

    setIsLoading(true);
    const croppedDataUrl = await getCroppedImg(imgRef.current, completedCrop);
    
    const result = await extractQuestionFromImage({ imageDataUri: croppedDataUrl });

    if (result.error) {
      toast({
        variant: 'destructive',
        title: 'Extraction Failed',
        description: result.error,
      });
    } else if (result.extractedText) {
      onTextExtracted(result.extractedText);
      toast({
        title: 'Text Extracted!',
        description: 'The question field has been populated.',
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'No Text Found',
        description: 'Could not extract any text from the selected area.',
      });
    }
    
    setIsLoading(false);
  }

  function getCroppedImg(image: HTMLImageElement, crop: Crop): Promise<string> {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = crop.width * scaleX;
    canvas.height = crop.height * scaleY;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return Promise.reject(new Error('Canvas context not available'));
    }

    ctx.drawImage(
      image,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      crop.width * scaleX,
      crop.height * scaleY
    );
    
    return new Promise((resolve) => {
        resolve(canvas.toDataURL('image/png'));
    });
  }

  const goToPrevPage = () => setPageNumber(prev => Math.max(1, prev - 1));
  const goToNextPage = () => setPageNumber(prev => Math.min(numPages!, prev + 1));

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-headline text-2xl">
          <FileUp className="w-6 h-6" /> Extract Question from PDF
        </CardTitle>
        <CardDescription>Upload a PDF, select a question by cropping, and let AI extract the text for you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input type="file" accept="application/pdf" onChange={onFileChange} />

        {file && (
          <div className="border-2 border-dashed rounded-lg p-4">
              <Document
                file={file}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={(error) => toast({ variant: 'destructive', title: 'PDF Load Error', description: error.message})}
                className="flex flex-col items-center"
              >
                <div style={{ display: pageImgSrc ? 'none' : 'block' }}>
                    {isRendering && <div className='flex items-center justify-center p-8'><LoaderCircle className="my-8 h-8 w-8 animate-spin" /></div>}
                     <Page pageNumber={pageNumber} onRenderSuccess={onPageRenderSuccess} onRenderError={() => setIsRendering(false)} onRenderStart={()=> { setPageImgSrc(''); setIsRendering(true); }} />
                </div>
              </Document>
              {numPages && (
                <div className="flex items-center justify-center gap-4 mt-4">
                    <Button variant="outline" size="icon" onClick={goToPrevPage} disabled={pageNumber <= 1}>
                        <ChevronLeft />
                    </Button>
                    <p className='text-sm text-muted-foreground'>Page {pageNumber} of {numPages}</p>
                    <Button variant="outline" size="icon" onClick={goToNextPage} disabled={pageNumber >= numPages}>
                        <ChevronRight />
                    </Button>
                </div>
              )}
          </div>
        )}

        {pageImgSrc && (
          <div className="space-y-4">
            <div className="flex justify-center p-4 border-2 border-dashed rounded-lg">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={aspect}
              >
                <img ref={imgRef} alt="Crop me" src={pageImgSrc} onLoad={onImageLoad} style={{ maxHeight: '70vh' }} />
              </ReactCrop>
            </div>
            
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Instructions</AlertTitle>
              <AlertDescription>
                Drag the selection box over the question text you want to extract. Then click the "Extract Text" button.
              </AlertDescription>
            </Alert>

            <Button onClick={handleExtractClick} disabled={isLoading || !completedCrop}>
              {isLoading ? (
                <>
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <Scissors className="mr-2 h-4 w-4" />
                  Extract Text from Selection
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
