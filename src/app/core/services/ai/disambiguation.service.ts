// src/app/core/services/ai/disambiguation.service.ts - PROXY VERSION
import { Injectable } from '@angular/core';
import { SimplifiedDisambiguationService } from './simplified-disambiguation.service';
import { DepartmentIconMappingService } from './department-icon-mapping.service';
import {
  DisambiguationOption,
  PendingAction,
  MultiItemPendingAction,
  AIExecutionResult,
  ListSelectionOption
} from './ai-models';

@Injectable({
  providedIn: 'root'
})
export class DisambiguationService {

  constructor(
    private simplifiedDisambiguation: SimplifiedDisambiguationService,
    private departmentIconMapping: DepartmentIconMappingService
  ) {}

  // ========================================
  // DELEGATE TO SIMPLIFIED SERVICE
  // ========================================

  async getDisambiguationOptions(itemName: string, excludeId?: string): Promise<DisambiguationOption[]> {
    return this.simplifiedDisambiguation.getDisambiguationOptions(itemName, excludeId);
  }

  async handleDisambiguationChoice(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    return this.simplifiedDisambiguation.handleDisambiguationChoice(pendingAction, selectedOption);
  }

  async processMultiItemSequentially(action: MultiItemPendingAction): Promise<AIExecutionResult> {
    return this.simplifiedDisambiguation.processMultiItemSequentially(action);
  }

  async processCurrentItemAndContinue(
    action: MultiItemPendingAction,
    selectedArticle: any
  ): Promise<AIExecutionResult> {
    return this.simplifiedDisambiguation.processCurrentItemAndContinue(action, selectedArticle);
  }

  async handleListSelection(pendingAction: PendingAction, selectedOption: DisambiguationOption): Promise<AIExecutionResult> {
    return this.simplifiedDisambiguation.handleListSelection(pendingAction, selectedOption);
  }

  async getListSelectionOptions(): Promise<ListSelectionOption[]> {
    return this.simplifiedDisambiguation.getListSelectionOptions();
  }

  convertListsToDisambiguationOptions(listOptions: ListSelectionOption[]): DisambiguationOption[] {
    return this.simplifiedDisambiguation.convertListsToDisambiguationOptions(listOptions);
  }

  async handleListSelectionForMultiItems(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    return this.simplifiedDisambiguation.handleListSelectionForMultiItems(pendingAction, selectedOption);
  }

  // ========================================
  // SUGGESTION METHODS - DELEGATE TO MAPPING SERVICE
  // ========================================

  suggestDepartment(itemName: string): string {
    return this.departmentIconMapping.suggestDepartment(itemName);
  }

  suggestIcon(itemName: string): string {
    return this.departmentIconMapping.suggestIcon(itemName);
  }
}