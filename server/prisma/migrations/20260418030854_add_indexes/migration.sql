-- CreateIndex
CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");

-- CreateIndex
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");

-- CreateIndex
CREATE INDEX "GameInvite_createdAt_idx" ON "GameInvite"("createdAt");

-- CreateIndex
CREATE INDEX "GameInvite_inviteeId_status_idx" ON "GameInvite"("inviteeId", "status");
