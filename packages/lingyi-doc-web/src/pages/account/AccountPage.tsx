import React, { useMemo, useSyncExternalStore } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authStore } from '../../stores/authStore';
import { getAvatarColor, getAvatarText } from '../../utils/formatDate';
import {
  ACCOUNT_MENU_ITEMS,
  accountSectionPath,
  parseAccountSection,
  type AccountSection,
} from './accountSections';
import { AccountProfileSection } from './AccountProfileSection';
import { AccountSettingsSection } from './AccountSettingsSection';
import { AccountLoginLogsSection } from './AccountLoginLogsSection';
import { AccountMembershipSection } from './AccountMembershipSection';

const BRAND = '#3370ff';
const BORDER = '#dee0e3';
const BG = '#f5f6f7';
const TEXT = '#1f2329';
const MUTED = '#8f959e';

function sectionContent(section: AccountSection, focusPassword: boolean) {
  switch (section) {
    case 'profile':
      return <AccountProfileSection />;
    case 'settings':
      return <AccountSettingsSection focusPassword={focusPassword} />;
    case 'logs':
      return <AccountLoginLogsSection />;
    case 'membership':
      return <AccountMembershipSection />;
    default:
      return <AccountProfileSection />;
  }
}

export const AccountPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useSyncExternalStore(authStore.subscribe, () => authStore.getState().user);

  const section = parseAccountSection(searchParams.get('section'));
  const focusPassword = searchParams.get('focus') === 'password';
  const activeMenu = useMemo(
    () => ACCOUNT_MENU_ITEMS.find(item => item.key === section) ?? ACCOUNT_MENU_ITEMS[0],
    [section],
  );

  const avatarLabel = user?.displayName || user?.email || '?';

  const onSelectSection = (next: AccountSection) => {
    setSearchParams({ section: next }, { replace: true });
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', background: BG }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 24px 48px' }}>
        <div style={{ marginBottom: 20 }}>
          <ButtonLink onClick={() => navigate(-1)}>← 返回</ButtonLink>
          <h1 style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 600, color: TEXT }}>个人中心</h1>
          <p style={{ margin: '6px 0 0', color: MUTED, fontSize: 14 }}>管理个人资料、账号安全与会员权益</p>
        </div>

        <div style={{
          display: 'flex',
          gap: 20,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}>
          <aside style={{
            width: 240,
            flexShrink: 0,
            background: '#fff',
            borderRadius: 12,
            border: `1px solid ${BORDER}`,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '20px 16px',
              borderBottom: `1px solid ${BORDER}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: getAvatarColor(avatarLabel),
                  color: '#fff', fontSize: 16, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {getAvatarText(avatarLabel)}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 15, fontWeight: 600, color: TEXT,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {user?.displayName || '未设置昵称'}
                </div>
                <div style={{
                  fontSize: 12, color: MUTED, marginTop: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {user?.email}
                </div>
              </div>
            </div>

            <nav style={{ padding: '8px 0' }}>
              {ACCOUNT_MENU_ITEMS.map(item => {
                const active = item.key === section;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onSelectSection(item.key)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: active ? '#eef3ff' : 'transparent',
                      padding: '12px 16px',
                      cursor: 'pointer',
                      borderLeft: active ? `3px solid ${BRAND}` : '3px solid transparent',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: active ? 600 : 500, color: active ? BRAND : TEXT }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{item.description}</div>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main style={{ flex: 1, minWidth: 320 }}>
            <div style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: TEXT }}>{activeMenu.label}</h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>{activeMenu.description}</p>
            </div>
            {sectionContent(section, focusPassword)}
          </main>
        </div>
      </div>
    </div>
  );
};

function ButtonLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'none',
        background: 'none',
        padding: 0,
        color: BRAND,
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/** @deprecated 使用 AccountPage */
export const AccountSettingsPage = AccountPage;

export { accountSectionPath };
