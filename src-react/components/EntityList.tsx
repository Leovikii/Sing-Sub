import { ActionIcon, Box, Button, Card, Group, Modal, Stack, Text, Title, Tooltip, UnstyledButton, VisuallyHidden } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical, Save } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import { reconcileOrder } from './entity-order';
import classes from './EntityList.module.css';

const OrderContext = createContext<{
  items: string[]; sorting: boolean; saving: boolean; move: (id: string, delta: number) => void;
}>({ items: [], sorting: false, saving: false, move: () => {} });

export function EntityList({ items, title, actions, onSave, children, empty, layout = 'grid', onDirtyChange, guard = true }: {
  items: string[]; title: string; actions?: ReactNode;
  onSave: (order: string[]) => boolean | Promise<boolean>;
  children: (id: string) => ReactNode; empty?: ReactNode; layout?: 'grid' | 'stack'; onDirtyChange?: (dirty: boolean) => void; guard?: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string[] | null>(null);
  const [sorting, setSorting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const order = reconcileOrder(items, draft ?? items);
  const dirty = order.some((id, index) => id !== items[index]);
  const active = sorting || dirty;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const move = (id: string, delta: number) => {
    if (saving) return;
    const from = order.indexOf(id), to = from + delta;
    if (from < 0 || to < 0 || to >= order.length || from === to) return;
    setDraft(arrayMove(order, from, to)); setSorting(true);
    setAnnouncement(t('sorting.moved', { position: to + 1, count: order.length }));
  };
  const endDrag = ({ active: item, over }: DragEndEvent) => {
    if (over) move(String(item.id), order.indexOf(String(over.id)) - order.indexOf(String(item.id)));
  };
  const save = async () => {
    setSaving(true);
    try {
      if (await onSave(order)) { setDraft(null); setSorting(false); setAnnouncement(t('sorting.saved')); }
    } catch {
      notifications.show({ color: 'red', message: t('sorting.saveFailed') });
    } finally { setSaving(false); }
  };
  return (
    <OrderContext.Provider value={{ items: order, sorting: active, saving, move }}>
      <Stack gap="md" style={layout === 'stack' ? { '--entity-toolbar-top': '0px' } as CSSProperties : undefined}>
        <Group justify="space-between" className={classes.toolbar} role="region" aria-label={t('sorting.toolbar')}>
          <Title order={layout === 'stack' ? 3 : 1}>{title}</Title>
          <Group gap="xs">
            {active ? <>
              <Button h={44} variant="default" disabled={saving} onClick={() => { setDraft(null); setSorting(false); }}>{t('common.cancel')}</Button>
              <Button h={44} leftSection={<Save size={17} />} disabled={!dirty} loading={saving} onClick={() => void save()}>{t('sorting.save')}</Button>
            </> : <>
              {items.length > 1 && <Button h={44} variant="default" leftSection={<ArrowUpDown size={17} />} onClick={() => setSorting(true)}>{t('sorting.start')}</Button>}
              {actions}
            </>}
          </Group>
        </Group>
        {active && <Text size="sm" c="dimmed">{t('sorting.hint')}</Text>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={endDrag}
          accessibility={{ screenReaderInstructions: { draggable: t('sorting.keyboard') }, announcements: {
            onDragStart: () => t('sorting.picked'),
            onDragOver: ({ over }) => over ? t('sorting.moved', { position: order.indexOf(String(over.id)) + 1, count: order.length }) : undefined,
            onDragEnd: () => t('sorting.dropped'), onDragCancel: () => t('sorting.cancelled'),
          } }}>
          <SortableContext items={order} strategy={rectSortingStrategy}>
            {order.length ? <div className={layout === 'grid' ? classes.grid : classes.stack}>{order.map(id => <Box key={id} miw={0} style={{ display: 'grid' }}>{children(id)}</Box>)}</div> : empty}
          </SortableContext>
        </DndContext>
        <VisuallyHidden aria-live="polite">{announcement}</VisuallyHidden>
      </Stack>
      {guard && dirty && <OrderLeaveGuard dirty={dirty} />}
    </OrderContext.Provider>
  );
}

function OrderLeaveGuard({ dirty }: { dirty: boolean }) {
  const { t } = useTranslation();
  const blocker = useBlocker(dirty);
  useBeforeUnload(useCallback((event) => {
    if (dirty) { event.preventDefault(); event.returnValue = ''; }
  }, [dirty]));
  return (
      <Modal opened={blocker.state === 'blocked'} onClose={() => blocker.state === 'blocked' && blocker.reset()}
        title={t('common.unsavedTitle')} centered closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}>
        <Text size="sm">{t('sorting.leaveMessage')}</Text>
        <Group justify="flex-end" mt="md">
          <Button h={44} variant="default" onClick={() => blocker.state === 'blocked' && blocker.reset()}>{t('common.cancel')}</Button>
          <Button h={44} color="red" onClick={() => blocker.state === 'blocked' && blocker.proceed()}>{t('common.discard')}</Button>
        </Group>
      </Modal>
  );
}

export function EntityCard({ id, name, note, actions, footer, onPreview, previewLabel, children }: {
  id: string; name: string; note?: string; actions?: ReactNode; footer?: ReactNode;
  onPreview?: () => void; previewLabel?: string; children?: ReactNode;
}) {
  const { t } = useTranslation();
  const { items, sorting, saving, move } = useContext(OrderContext);
  const canSort = items.length > 1;
  const index = items.indexOf(id);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !canSort || saving });
  return <Card ref={setNodeRef} role="article" aria-label={name} withBorder radius="lg" pos="relative"
    className={[classes.card, !canSort && classes.single, sorting && classes.sorting, children && classes.formCard, isDragging && classes.dragging].filter(Boolean).join(' ')}
    style={{ transform: CSS.Transform.toString(transform), transition }}>
    {onPreview && <UnstyledButton className={classes.preview} disabled={sorting} onClick={onPreview} aria-label={previewLabel} />}
    {canSort && <Tooltip label={t('sorting.handle', { name })} events={{ hover: true, focus: true, touch: false }}>
      <ActionIcon ref={setActivatorNodeRef} className={classes.handle} size={44} variant="subtle" disabled={saving}
        aria-label={t('sorting.handle', { name })} {...attributes} {...listeners}><GripVertical size={18} /></ActionIcon>
    </Tooltip>}
    <Group justify="space-between" wrap="nowrap" gap={4} mih={44}>
      <Tooltip label={name} events={{ hover: true, focus: true, touch: true }}><Text fw={700} size="md" truncate miw={0}>{name}</Text></Tooltip>
      <Group gap={0} wrap="nowrap" className={classes.action}>
        {sorting ? <>{([-1, 1] as const).map(delta => <Tooltip key={delta} label={t(delta < 0 ? 'sorting.up' : 'sorting.down', { name })}>
          <ActionIcon size={44} variant="subtle" disabled={saving || index + delta < 0 || index + delta >= items.length}
            aria-label={t(delta < 0 ? 'sorting.up' : 'sorting.down', { name })} onClick={() => move(id, delta)}>
            {delta < 0 ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
          </ActionIcon>
        </Tooltip>)}</> : actions}
      </Group>
    </Group>
    {children ? <Box mt="sm" className={classes.action} inert={sorting}>{children}</Box> : <Text size="sm" c="dimmed" lineClamp={2} mt={4} className={classes.note}>{note || t('common.noNote')}</Text>}
    {footer && <Box className={`${classes.footer} ${classes.action}`} inert={sorting} style={{ opacity: sorting ? 0.6 : 1 }}>{footer}</Box>}
  </Card>;
}
