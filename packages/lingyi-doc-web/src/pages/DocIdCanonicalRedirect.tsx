import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { appPath } from '../utils/appPaths';
import { resolveDocHref } from '../utils/navigateToDoc';

/** 将 /workspace/doc/:docId 或 /doc/:docId 重定向到 /{space}/{book}/{doc} */
export const DocIdCanonicalRedirect: React.FC = () => {
  const { docId } = useParams<{ docId: string }>();
  const [href, setHref] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    resolveDocHref(docId)
      .then(path => {
        if (!cancelled) setHref(path);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [docId]);

  if (!docId || failed) {
    return <Navigate to={appPath.home} replace />;
  }

  if (href) {
    return <Navigate to={href} replace />;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#666' }}>
      正在跳转…
    </div>
  );
};
