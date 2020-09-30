// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/** @jsx jsx */
import React, { useCallback, useState } from 'react';
import { jsx, css } from '@emotion/core';
import { SearchBox } from 'office-ui-fabric-react/lib/SearchBox';
import { FocusZone, FocusZoneDirection } from 'office-ui-fabric-react/lib/FocusZone';
import cloneDeep from 'lodash/cloneDeep';
import formatMessage from 'format-message';
import { DialogInfo, ITrigger } from '@bfc/shared';
import debounce from 'lodash/debounce';
import { useRecoilValue } from 'recoil';
import { ISearchBoxStyles } from 'office-ui-fabric-react/lib/SearchBox';

import { dispatcherState, userSettingsState, currentProjectIdState } from '../../recoilModel';
import { botProjectSpaceSelector } from '../../recoilModel/selectors';
import { createSelectedPath, getFriendlyName } from '../../utils/dialogUtil';
import { containUnsupportedTriggers, triggerNotSupported } from '../../utils/dialogValidator';

import { TreeItem } from './treeItem';
import { ExpandableNode } from './ExpandableNode';

// -------------------- Styles -------------------- //

const searchBox: ISearchBoxStyles = {
  root: {
    borderBottom: '1px solid #edebe9',
    height: '45px',
    borderRadius: '0px',
  },
};

const root = css`
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
  .ms-List-cell {
    min-height: 16px;
  }
  label: root;
`;

// -------------------- ProjectTree -------------------- //

export type TreeLink = {
  displayName: string;
  isRoot: boolean;
  warningContent?: string;
  errorContent?: string;
  projectId: string;
  skillId?: string;
  dialogName?: string;
  trigger?: number;
};

function getTriggerName(trigger: ITrigger) {
  return trigger.displayName || getFriendlyName({ $kind: trigger.type });
}

function sortDialog(dialogs: DialogInfo[]) {
  const dialogsCopy = cloneDeep(dialogs);
  return dialogsCopy.sort((x, y) => {
    if (x.isRoot) {
      return -1;
    } else if (y.isRoot) {
      return 1;
    } else {
      return 0;
    }
  });
}

interface IProjectTreeProps {
  selectedDialog: string;
  selected: string;
  onSelect: (link: TreeLink) => void;
  onDelete: (link: TreeLink) => void | void;
  showTriggers?: boolean;
  showDialogs?: boolean;
}

const TYPE_TO_ICON_MAP = {
  'Microsoft.OnUnknownIntent': '',
};

type BotInProject = {
  dialogs: DialogInfo[];
  projectId: string;
  name: string;
  isRemote: boolean;
};

export const ProjectTree: React.FC<IProjectTreeProps> = ({
  selectedDialog,
  selected,
  onSelect,
  onDelete = undefined,
  showTriggers = true,
  showDialogs = true,
}) => {
  const { onboardingAddCoachMarkRef, updateUserSettings } = useRecoilValue(dispatcherState);
  const { dialogNavWidth: currentWidth } = useRecoilValue(userSettingsState);

  const [filter, setFilter] = useState('');
  const delayedSetFilter = debounce((newValue) => setFilter(newValue), 1000);
  const addMainDialogRef = useCallback((mainDialog) => onboardingAddCoachMarkRef({ mainDialog }), []);
  const projectCollection = useRecoilValue<BotInProject[]>(botProjectSpaceSelector).map((bot) => ({
    ...bot,
    hasWarnings: false,
  }));
  const currentProjectId = useRecoilValue(currentProjectIdState);

  const botHasWarnings = (bot: BotInProject) => {
    return bot.dialogs.some((dialog) => dialog.triggers.some((tr) => triggerNotSupported(dialog, tr)));
  };

  const botHasErrors = (bot: BotInProject) => {
    // TODO: this is just a stub for now
    return false;
  };

  const renderBotHeader = (bot: BotInProject) => {
    const link: TreeLink = {
      displayName: bot.name,
      projectId: currentProjectId,
      skillId: bot.projectId,
      isRoot: true,
      warningContent: botHasWarnings(bot) ? formatMessage('This bot has warnings') : undefined,
      errorContent: botHasErrors(bot) ? formatMessage('This bot has errors') : undefined,
    };

    return (
      <span
        css={css`
          margin-top: -6px;
          width: 100%;
          label: bot-header;
        `}
        role="grid"
      >
        <TreeItem
          showProps
          icon={bot.isRemote ? 'Globe' : 'ChatBot'}
          isSubItemActive={!!selected}
          link={link}
          shiftOut={bot.isRemote ? 28 : 0}
          onSelect={onSelect}
        />
      </span>
    );
  };

  const renderDialogHeader = (botId: string, dialog: DialogInfo, warningContent: string) => {
    const link: TreeLink = {
      dialogName: dialog.id,
      displayName: dialog.displayName,
      isRoot: dialog.isRoot,
      projectId: currentProjectId,
      skillId: botId,
      warningContent,
    };
    return (
      <span
        ref={dialog.isRoot ? addMainDialogRef : null}
        css={css`
          margin-top: -6px;
          width: 100%;
          label: dialog-header;
        `}
        role="grid"
      >
        <TreeItem
          showProps
          icon={'CannedChat'}
          isSubItemActive={!!selected}
          link={link}
          shiftOut={showTriggers ? 0 : 28}
          onDelete={onDelete}
          onSelect={onSelect}
        />
      </span>
    );
  };

  function renderTrigger(projectId: string, item: any, dialog: DialogInfo): React.ReactNode {
    const link: TreeLink = {
      displayName: item.displayName,
      warningContent: item.warningContent,
      errorContent: item.errorContent,
      trigger: item.index,
      dialogName: dialog.id,
      isRoot: false,
      projectId: currentProjectId,
      skillId: projectId,
    };

    return (
      <TreeItem
        key={`${item.id}_${item.index}`}
        dialogName={dialog.displayName}
        icon={TYPE_TO_ICON_MAP[item.type] || 'Flow'}
        isActive={dialog.id === selectedDialog && createSelectedPath(item.index) === selected}
        link={link}
        shiftOut={48}
        onDelete={onDelete}
        onSelect={onSelect}
      />
    );
  }

  const onFilter = (_e?: any, newValue?: string): void => {
    if (typeof newValue === 'string') {
      delayedSetFilter(newValue);
    }
  };

  function filterMatch(scope: string) {
    return scope.toLowerCase().includes(filter.toLowerCase());
  }

  function createDetailsTree(bot: BotInProject, startDepth: number) {
    const { projectId } = bot;
    const dialogs = sortDialog(bot.dialogs);

    const filteredDialogs =
      filter == null || filter.length === 0
        ? dialogs
        : dialogs.filter(
            (dialog) =>
              filterMatch(dialog.displayName) || dialog.triggers.some((trigger) => filterMatch(getTriggerName(trigger)))
          );

    if (showTriggers) {
      return filteredDialogs.map((dialog: DialogInfo) => {
        const triggerList = dialog.triggers
          .filter((tr) => filterMatch(dialog.displayName) || filterMatch(getTriggerName(tr)))
          .map((tr, index) => {
            const warningContent = triggerNotSupported(dialog, tr);
            return renderTrigger(projectId, { ...tr, index, displayName: getTriggerName(tr), warningContent }, dialog);
          });
        return (
          <ExpandableNode
            key={dialog.id}
            ref={dialog.isRoot ? addMainDialogRef : undefined}
            depth={startDepth}
            summary={renderDialogHeader(projectId, dialog, containUnsupportedTriggers(dialog))}
          >
            <div>{triggerList}</div>
          </ExpandableNode>
        );
      });
    } else {
      return filteredDialogs.map((dialog: DialogInfo) =>
        renderDialogHeader(projectId, dialog, containUnsupportedTriggers(dialog))
      );
    }
  }

  function createBotSubtree(bot: BotInProject & { hasWarnings: boolean }) {
    if (showDialogs && !bot.isRemote) {
      return (
        <ExpandableNode key={bot.projectId} summary={renderBotHeader(bot)}>
          <div>{createDetailsTree(bot, 1)}</div>
        </ExpandableNode>
      );
    } else {
      return renderBotHeader(bot);
    }
  }

  const projectTree =
    projectCollection.length === 1
      ? createDetailsTree(projectCollection[0], 0)
      : projectCollection.map(createBotSubtree);

  return (
    <div
      aria-label={formatMessage('Navigation pane')}
      className="ProjectTree"
      css={root}
      data-testid="ProjectTree"
      role="region"
    >
      <FocusZone isCircularNavigation direction={FocusZoneDirection.vertical}>
        <SearchBox
          underlined
          ariaLabel={formatMessage('Type dialog name')}
          iconProps={{ iconName: 'Filter' }}
          placeholder={formatMessage('Filter Dialog')}
          styles={searchBox}
          onChange={onFilter}
        />
        <div
          aria-label={formatMessage(
            `{
            dialogNum, plural,
                =0 {No bots}
                =1 {One bot}
              other {# bots}
            } have been found.
            {
              dialogNum, select,
                  0 {}
                other {Press down arrow key to navigate the search results}
            }`,
            { dialogNum: projectCollection.length }
          )}
          aria-live={'polite'}
        />
        {projectTree}
      </FocusZone>
    </div>
  );
};
