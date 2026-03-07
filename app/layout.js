import './globals.css';

export const metadata = {
  title: 'Composite MLB Rankings | Live Scores, Rankings & Predictions',
  description: 'Real-time composite MLB power rankings from multiple sources. Live scores, team analytics, and AI-powered game predictions.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0a0e1a" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
