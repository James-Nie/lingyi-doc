import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button, Card, Space, Steps, Tabs, Typography, message,
} from 'antd';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { FormInstance } from 'antd';
import { Form } from 'antd';
import { adminFetch } from '../../stores/authStore';
import { TemplateBasicInfoForm, type TemplateBasicFormValues } from './TemplateBasicInfoForm';
import { TemplateContentPanel } from './TemplateContentPanel';
import type { TemplateContentEditorHandle } from './editors/TemplateContentEditorHandle';
import {
  type TemplateDetail,
  type TemplateDocType,
  type TemplateStatus,
} from './templateConstants';

function buildMetaPayload(values: TemplateBasicFormValues) {
  return {
    title: values.title?.trim() ?? '',
    subtitle: values.subtitle?.trim() ?? '',
    docType: values.docType,
    documentTitle: values.documentTitle?.trim() ?? '',
    categories: values.categories ?? ['recommended'],
    usageLabel: values.usageLabel ?? null,
    isNew: !!values.isNew,
    isBlank: !!values.isBlank,
    sortOrder: values.sortOrder ?? 0,
    status: (values.status ?? 'draft') as TemplateStatus,
  };
}

export const TemplateEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [basicForm] = Form.useForm<TemplateBasicFormValues>();
  const contentEditorRef = useRef<TemplateContentEditorHandle>(null);

  const [loading, setLoading] = useState(isEdit);
  const [savingBasic, setSavingBasic] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  /** 第一步确认后的文档类型，第二步编辑面板与此保持一致 */
  const [createDocType, setCreateDocType] = useState<TemplateDocType | null>(null);
  const [createIsBlank, setCreateIsBlank] = useState(false);
  /** 第一步表单快照（第二步时基本信息表单已卸载，需缓存） */
  const [createFormValues, setCreateFormValues] = useState<TemplateBasicFormValues | null>(null);
  const [contentJson, setContentJson] = useState<unknown | null>(null);
  const [editorKey, setEditorKey] = useState('init');
  /** 接口返回的元信息；内容 Tab 未挂载基本信息表单时作为 docType 等字段的回退 */
  const [loadedMeta, setLoadedMeta] = useState<{
    docType: TemplateDocType;
    documentTitle: string;
    isBlank: boolean;
  } | null>(null);

  const activeTab = searchParams.get('tab') === 'content' ? 'content' : 'basic';

  const load = useCallback(async () => {
    if (!isEdit || !id) return;
    setLoading(true);
    try {
      const detail = await adminFetch<TemplateDetail>(`/api/v1/admin/templates/${id}`);
      basicForm.setFieldsValue({
        id: detail.id,
        title: detail.title,
        subtitle: detail.subtitle,
        docType: detail.docType,
        documentTitle: detail.documentTitle,
        categories: detail.categories,
        usageLabel: detail.usageLabel ?? undefined,
        isNew: detail.isNew,
        isBlank: detail.isBlank,
        sortOrder: detail.sortOrder,
        status: detail.status,
      });
      setContentJson(detail.contentJson);
      setLoadedMeta({
        docType: detail.docType,
        documentTitle: detail.documentTitle,
        isBlank: detail.isBlank,
      });
      setEditorKey(`${detail.id}-${detail.updatedAt}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [basicForm, id, isEdit]);

  useEffect(() => { void load(); }, [load]);

  const watchDocType = Form.useWatch('docType', basicForm) as TemplateDocType | undefined;
  const watchDocumentTitle = Form.useWatch('documentTitle', basicForm) as string | undefined;
  const watchIsBlank = Form.useWatch('isBlank', basicForm) as boolean | undefined;

  const saveBasicInfo = async (form: FormInstance<TemplateBasicFormValues>) => {
    const values = await form.validateFields();
    setSavingBasic(true);
    try {
      const payload = buildMetaPayload(values);
      if (isEdit && id) {
        await adminFetch(`/api/v1/admin/templates/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        message.success('基本信息已保存');
        void load();
      } else {
        const created = await adminFetch<TemplateDetail>('/api/v1/admin/templates', {
          method: 'POST',
          body: JSON.stringify({ ...payload, contentJson: null }),
        });
        message.success('模板已创建，请继续编辑内容');
        navigate(`/templates/${created.id}/edit?tab=content`, { replace: true });
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingBasic(false);
    }
  };

  const saveContent = async () => {
    if (!isEdit || !id) {
      message.warning('请先保存基本信息');
      return;
    }
    const values = basicForm.getFieldsValue();
    if (values.isBlank) {
      setSavingContent(true);
      try {
        await adminFetch(`/api/v1/admin/templates/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ contentJson: null, isBlank: true }),
        });
        message.success('空白模板内容已更新');
        void load();
      } catch (err) {
        message.error(err instanceof Error ? err.message : '保存失败');
      } finally {
        setSavingContent(false);
      }
      return;
    }

    const json = contentEditorRef.current?.getContentJson() ?? null;
    setSavingContent(true);
    try {
      await adminFetch(`/api/v1/admin/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ contentJson: json, isBlank: false }),
      });
      message.success('模板内容已保存');
      setContentJson(json);
      setEditorKey(`${id}-${Date.now()}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingContent(false);
    }
  };

  const handleCreateFinish = async () => {
    if (!createDocType || !createFormValues) {
      message.warning('请先完善基本信息');
      setCreateStep(0);
      return;
    }
    setSavingContent(true);
    try {
      let json: unknown | null = null;
      if (!createIsBlank && createDocType !== 'slides') {
        json = contentEditorRef.current?.getContentJson() ?? null;
      }
      const created = await adminFetch<TemplateDetail>('/api/v1/admin/templates', {
        method: 'POST',
        body: JSON.stringify({
          ...buildMetaPayload({
            ...createFormValues,
            docType: createDocType,
            isBlank: createIsBlank,
          }),
          contentJson: json,
        }),
      });
      message.success('模板创建成功');
      navigate(`/templates/${created.id}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSavingContent(false);
    }
  };

  const goNextStep = async () => {
    try {
      const values = await basicForm.validateFields();
      if (createDocType && createDocType !== values.docType) {
        setContentJson(null);
      }
      setCreateFormValues(values);
      setCreateDocType(values.docType);
      setCreateIsBlank(!!values.isBlank);
      setCreateStep(1);
      setEditorKey(`create-${values.docType}-${Date.now()}`);
    } catch {
      message.warning('请先完善基本信息');
    }
  };

  const goPrevStep = () => {
    if (createFormValues) {
      basicForm.setFieldsValue(createFormValues);
    }
    setCreateStep(0);
  };

  if (loading) return <div>加载中…</div>;

  if (!isEdit) {
    return (
      <div>
        <Typography.Title level={4} style={{ marginTop: 0 }}>新建模板</Typography.Title>
        <Steps
          current={createStep}
          style={{ marginBottom: 24, maxWidth: 480 }}
          items={[{ title: '基本信息' }, { title: '模板内容' }]}
        />

        {createStep === 0 && (
          <>
            <Card title="基本信息">
              <TemplateBasicInfoForm form={basicForm} isEdit={false} lockDocType={false} />
            </Card>
            <Space style={{ marginTop: 16 }}>
              <Button onClick={() => navigate('/templates')}>取消</Button>
              <Button type="primary" onClick={() => void goNextStep()}>下一步：编辑内容</Button>
            </Space>
          </>
        )}

        {createStep === 1 && createDocType && (
          <>
            <Card
              title="模板内容"
              extra={(
                <Typography.Text type="secondary">
                  {TEMPLATE_DOC_TYPE_LABEL(createDocType)} · {createIsBlank ? '空白模板' : '可视化编辑'}
                </Typography.Text>
              )}
            >
              <TemplateContentPanel
                ref={contentEditorRef}
                editorKey={editorKey}
                docType={createDocType}
                documentTitle={createFormValues?.documentTitle ?? '未命名文档'}
                isBlank={createIsBlank}
                contentJson={contentJson}
              />
            </Card>
            <Space style={{ marginTop: 16 }}>
              <Button onClick={goPrevStep}>上一步</Button>
              <Button type="primary" loading={savingContent} onClick={() => void handleCreateFinish()}>
                创建模板
              </Button>
            </Space>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>编辑模板 · {id}</Typography.Title>
        <Button onClick={() => navigate(`/templates/${id}`)}>查看模板</Button>
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
                  <TemplateBasicInfoForm form={basicForm} isEdit lockDocType />
                </Card>
                <Space style={{ marginTop: 16 }}>
                  <Button onClick={() => navigate('/templates')}>返回列表</Button>
                  <Button type="primary" loading={savingBasic} onClick={() => void saveBasicInfo(basicForm)}>
                    保存基本信息
                  </Button>
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
                    ref={contentEditorRef}
                    editorKey={editorKey}
                    docType={watchDocType ?? loadedMeta?.docType ?? 'richtext'}
                    documentTitle={watchDocumentTitle ?? loadedMeta?.documentTitle ?? '未命名文档'}
                    isBlank={watchIsBlank ?? loadedMeta?.isBlank ?? false}
                    contentJson={contentJson}
                  />
                </Card>
                <Space style={{ marginTop: 16 }}>
                  <Button onClick={() => navigate('/templates')}>返回列表</Button>
                  <Button type="primary" loading={savingContent} onClick={() => void saveContent()}>
                    保存模板内容
                  </Button>
                </Space>
              </>
            ),
          },
        ]}
      />
    </div>
  );
};

function TEMPLATE_DOC_TYPE_LABEL(docType?: TemplateDocType): string {
  const map: Record<TemplateDocType, string> = {
    richtext: '文档',
    freeform: '表格',
    base: '多维表格',
    questionnaire: '问卷',
    mindnote: '思维笔记',
    slides: '幻灯片',
    whiteboard: '画板',
  };
  return docType ? map[docType] : '文档';
}
