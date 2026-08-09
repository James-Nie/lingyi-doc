import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Spin, message } from 'antd';
import { KnowledgeBaseApi, type KbMemberRole } from '../api/knowledgeBase';
import { authStore } from '../stores/authStore';
import { knowledgeBaseStore } from '../stores/knowledgeBaseStore';
import { appPath } from '../utils/appPaths';

const ROLE_LABEL: Record<Exclude<KbMemberRole, 'owner'>, string> = {
  admin: '管理员',
  editor: '可编辑',
  viewer: '可阅读',
};

export const KbInviteJoinPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{
    kbId: string;
    kbName: string;
    emoji: string;
    role: Exclude<KbMemberRole, 'owner'>;
    closed: boolean;
    alreadyMember: boolean;
  } | null>(null);

  useEffect(() => {
    if (!token) {
      setError('邀请链接无效');
      setLoading(false);
      return;
    }
    if (!authStore.isAuthenticated()) {
      const returnUrl = `${window.location.pathname}${window.location.search}`;
      navigate(`/login?redirect=${encodeURIComponent(returnUrl)}`, { replace: true });
      return;
    }

    setLoading(true);
    setError(null);
    void KnowledgeBaseApi.getInviteInfo(token)
      .then((res) => {
        setInfo(res);
        if (res.closed) {
          setError('邀请已关闭');
        } else if (res.alreadyMember) {
          navigate(appPath.wikiSpace(res.kbId), { replace: true });
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '无法加载邀请信息');
      })
      .finally(() => setLoading(false));
  }, [token, navigate]);

  const handleJoin = async () => {
    if (!token || !info) return;
    setJoining(true);
    setError(null);
    try {
      const res = await KnowledgeBaseApi.acceptInvite(token);
      message.success('已加入知识库');
      void knowledgeBaseStore.reload();
      navigate(appPath.wikiSpace(res.kbId), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入失败');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      </Shell>
    );
  }

  if (error && !info) {
    return (
      <Shell>
        <div style={{ ...cardStyle, textAlign: 'center', color: '#d83931' }}>{error}</div>
      </Shell>
    );
  }

  if (!info) {
    return (
      <Shell>
        <div style={{ ...cardStyle, textAlign: 'center', color: '#8f959e' }}>无法打开此邀请</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 32 }}>{info.emoji || '📘'}</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1f2329' }}>{info.kbName}</div>
            <div style={{ fontSize: 13, color: '#8f959e', marginTop: 4 }}>
              加入后权限：{ROLE_LABEL[info.role]}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#646a73', lineHeight: 1.6, marginBottom: 20 }}>
          你被邀请加入该知识库。确认后即可按对应权限访问与协作。
        </div>
        {error && (
          <div style={{ color: '#d83931', fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}
        <Button
          type="primary"
          block
          size="large"
          loading={joining}
          disabled={info.closed}
          onClick={() => void handleJoin()}
        >
          确认加入
        </Button>
      </div>
    </Shell>
  );
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa', padding: '48px 24px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>{children}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #dee0e3',
  borderRadius: 8,
  padding: 24,
};
