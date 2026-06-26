import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../../components/ui/card';

const Signup: React.FC = () => {
  const [isChrome, setIsChrome] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsChrome(/chrome/.test(userAgent) && !/edg/.test(userAgent));
  }, []);

  return (
    <div className={`min-h-screen flex items-center justify-center bg-white px-4 py-12 select-none ${isChrome ? 'chrome-browser' : ''}`} style={{ userSelect: 'none' }}>
      <div
        className="w-full max-w-md"
        style={isChrome ? { zoom: 1.25 } : undefined}
      >
        <Card className="border-gray-200 shadow-none">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-semibold text-center">
              ⚠️ Notice
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <ul className="space-y-3 text-sm text-gray-700 leading-relaxed list-disc pl-5">
              <li>
                This service is not publicly available at this time. Self-service registration is not supported.
              </li>
              <li>
                If you already have an approved account, you can log in directly using the link below.
              </li>
            </ul>
          </CardContent>

          <CardFooter className="flex flex-col gap-2 pt-0">
            <p className="text-sm text-center text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-gray-900 no-underline hover:underline hover:underline-offset-4">
                Log in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Signup;
