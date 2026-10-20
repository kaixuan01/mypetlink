# Final Solo and authorization gates

All required SQL Server cases assert availability. These 20 cases passed with zero skips.

| Test | Result | Duration |
| --- | --- | --- |
| SoloPermissionRevocationAndDifferentNomineeDenySelfReviewImmediately | Passed | 00:00:04.0667038 |
| SoloTeamModeStillRejectsMakerIncludingSuperAdmin(super: False) | Passed | 00:00:04.0470149 |
| SoloHttpRequiresBaseActionPermissionPolicyPermissionNominationAndAttestation | Passed | 00:00:01.6989442 |
| SoloAgreementNeedsConfirmationReasonAndActualAcceptance(confirmed: True, reason: "Reason long enough", evidence: "OTHER-EVIDENCE") | Passed | 00:00:04.1324791 |
| SoloAgreementNeedsConfirmationReasonAndActualAcceptance(confirmed: False, reason: "Reason long enough", evidence: "TEST-SIGNED") | Passed | 00:00:04.0515852 |
| SensitiveWorkflowsUseTheirDedicatedCapabilities | Passed | 00:00:00.0024738 |
| EveryCapabilityPolicyCanBeConstructed | Passed | 00:00:00.0004939 |
| SoloConcurrentPolicyChangesHaveOneWinnerAndReviewUsesCommittedPolicy | Passed | 00:00:04.0505212 |
| SoloAgreementNeedsConfirmationReasonAndActualAcceptance(confirmed: True, reason: "Reason long enough", evidence: "") | Passed | 00:00:04.0816536 |
| SoloIdempotentScriptBootstrapsEmptySchemaAndNeverResetsAnEnabledPolicy | Passed | 00:00:12.1817402 |
| EveryAdminEndpointRequiresACapability | Passed | 00:00:00.0024162 |
| SoloMigrationSeedsTeamPreservesOldEvidenceAndBlocksJournalTamperingAndRollback | Passed | 00:00:08.0796967 |
| SoloAgreementNeedsConfirmationReasonAndActualAcceptance(confirmed: True, reason: "short", evidence: "TEST-SIGNED") | Passed | 00:00:04.0978676 |
| SoloTeamModeStillRejectsMakerIncludingSuperAdmin(super: True) | Passed | 00:00:04.0806560 |
| SoloReceiptAndMissingDamagedReviewKeepActualCountsHoldsPdfAndNoFinance | Passed | 00:00:06.0118403 |
| SoloPolicyAuthorizationValidationAndStaleWritesFailSafely | Passed | 00:00:04.0785738 |
| ReadingAndChangingAreSeparateCapabilitiesForEveryHighRiskModule | Passed | 00:00:00.0008300 |
| EveryCapabilityInTheCatalogueIsUsedByAnEndpointOrIsExplainedHere | Passed | 00:00:00.0064628 |
| SoloAgreementEvidenceIsFrozenAndSwitchingTeamBackRestoresChecks | Passed | 00:00:04.4605843 |
| SoloSuperAdminCannotSelfReviewWhenAnotherFounderWasExplicitlyAuthorized | Passed | 00:00:10.5700572 |
