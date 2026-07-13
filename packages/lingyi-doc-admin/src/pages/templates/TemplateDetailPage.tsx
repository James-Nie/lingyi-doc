import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Space, Tabs, Typography, message } from 'antd';
import { Form } from 'antd';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { adminFetch, authStore } from '../../stores/authStore';
import { TemplateBasicInfoForm } from './TemplateBasicInfoForm';
import { TemplateContentPanel } from './TemplateContentPanel';
import type { TemplateDetail, TemplateDocType, TemplateStatus } from './templateConstants';

export const TemplateDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [basicForm] = Form.useForm();
  const canWrite = authStore.hasPermission('template:write');

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [contentJson, setContentJson] = useState<unknown | null>(null);
  const [editorKey, setEditorKey] = useState('init');

  const activeTab = searchParams.get('tab') === 'content' ? 'content' : 'basic';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await adminFetch<TemplateDetail>(`/api/v1/admin/templates/${id}`);
      basicForm.setFieldsValue({
        id: res.id,
        title: res.title,
        subtitle: res.subtitle,
        docType: res.docType,
        documentTitle: res.documentTitle,
        categories: res.categories,
        usageLabel: res.usageLabel ?? undefined,
        isNew: res.isNew,
        isBlank: res.isBlank,
        thumbGradient: res.thumbGradient,
        sortOrder: res.sortOrder,
        status: res.status,
      });
      setDetail(res);
      setContentJson(res.contentJson);
      setEditorKey(`${res.id}-${res.updatedAt}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [basicForm, id]);

  useEffect(() => { void load(); }, [load]);

  const watchDocType = Form.useWatch('docType', basicForm) as TemplateDocType | undefined;
  const watchDocumentTitle = Form.useWatch('documentTitle', basicForm) as string | undefined;
  const watchIsBlank = Form.useWatch('isBlank', basicForm) as boolean | undefined;

  const handleStatusChange = async (status: TemplateStatus) => {
    if (!id) return;
    try {
      await adminFetch(`/api/v1/admin/templates/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      message.success('状态已更新');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  if (loading) return <div>加载中…</div>;
  if (!detail || !id) return <div>模板不存在</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>查看模板 · {id}</Typography.Title>
        <Space wrap>
          {canWrite && detail.status !== 'published' && (
            <Button onClick={() => void handleStatusChange('published')}>发布</Button>
          )}
          {canWrite && detail.status === 'published' && (
            <Button onClick={() => void handleStatusChange('archived')}>下架</Button>
          )}
          {canWrite && (
            <Button type="primary" onClick={() => navigate(`/templates/${id}/edit`)}>编辑</Button>
          )}
        </Space>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setSearchParams(key === 'basic' ? {} : { tab: key })}
        items={[
          {
            key: 'basic',
            label: '基本信息',
            children: (
              <>
                <Card>
                  <TemplateBasicInfoForm form={basicForm} isEdit readOnly lockDocType />
                </Card>
                <Space style={{ marginTop: 16 }}>
                  <Button onClick={() => navigate('/templates')}>返回列表</Button>
                  {canWrite && (
                    <Button type="primary" onClick={() => navigate(`/templates/${id}/edit`)}>
                      编辑基本信息
                    </Button>
                  )}
                </Space>
              </>
            ),
          },
          {
            key: 'content',
            label: '模板内容',
            children: (
              <>
                <Card>
                  <TemplateContentPanel
                    editorKey={editorKey}
                    previewMode
                    docType={watchDocType ?? detail.docType}
                    documentTitle={watchDocumentTitle ?? detail.documentTitle}
                    isBlank={watchIsBlank ?? detail.isBlank}
                    contentJson={contentJson}
                  />
                </Card>
                <Space style={{ marginTop: 16 }}>
                  <Button onClick={() => navigate('/templates')}>返回列表</Button>
                  {canWrite && (
                    <Button type="primary" onClick={() => navigate(`/templates/${id}/edit?tab=content`)}>
                      编辑模板内容
                    </Button>
                  )}
                </Space>
              </>
            ),
          },
        ]}
      />
    </div>
  );
};
