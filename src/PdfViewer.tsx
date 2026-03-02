import React from 'react';
import dynamic from 'next/dynamic';
import { Box, CircularProgress, Typography } from '@mui/material';
import { PictureAsPdfOutlined } from '@mui/icons-material';

import type { PdfViewerProps } from './PdfViewerClient';

export type { PdfViewerProps };

function ViewerSkeleton() {
  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 2,
      backgroundColor: '#E8EDF6',
    }}>
      <PictureAsPdfOutlined sx={{ fontSize: 48, color: '#90A4AE' }} />
      <CircularProgress size={28} sx={{ color: '#1565C0' }} />
      <Typography variant="caption" sx={{ color: '#78909C' }}>
        Loading PDF viewer…
      </Typography>
    </Box>
  );
}

const PdfViewerClient = dynamic<PdfViewerProps>(
  () => import('./PdfViewerClient'),
  { ssr: false, loading: ViewerSkeleton },
);

export default function PdfViewer(props: PdfViewerProps) {
  return <PdfViewerClient {...props} />;
}
