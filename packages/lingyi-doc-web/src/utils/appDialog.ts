import { Modal } from 'antd';

const DELETE_TO_RECYCLE_BIN_MESSAGE =
  '确定删除该文档吗？删除后将移入回收站，30 天内可恢复。';

export function confirmDialog(options: {
  title: string;
  content: string;
  okText?: string;
  cancelText?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({
      title: options.title,
      content: options.content,
      okText: options.okText ?? '确定',
      cancelText: options.cancelText ?? '取消',
      okButtonProps: options.danger ? { danger: true } : undefined,
      centered: true,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

export function confirmDeleteToRecycleBin(): Promise<boolean> {
  return confirmDialog({
    title: '删除文档',
    content: DELETE_TO_RECYCLE_BIN_MESSAGE,
    okText: '删除',
    danger: true,
  });
}

export function confirmPermanentDelete(count: number): Promise<boolean> {
  const content = count > 1
    ? `确定彻底删除 ${count} 个项目吗？此操作不可恢复。`
    : '确定彻底删除该项目吗？此操作不可恢复。';
  return confirmDialog({
    title: '彻底删除',
    content,
    okText: '彻底删除',
    danger: true,
  });
}
