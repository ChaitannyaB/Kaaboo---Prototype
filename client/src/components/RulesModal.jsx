export default function RulesModal({ onClose }) {
  return (
    <div className="rules-overlay" onClick={onClose}>
      <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rules-header">
          <h2 className="rules-title">How to Play Kaaboo</h2>
          <button className="rules-close" onClick={onClose}>×</button>
        </div>

        <div className="rules-body">

          <section className="rules-section">
            <h3 className="rules-section-title">Setup</h3>
            <ul className="rules-list">
              <li>54-card deck (13 per suit + 2 Jokers). Each player starts with <strong>4 cards</strong> in a 2×2 grid.</li>
              <li>At game start you have <strong>10 seconds</strong> to peek at your own two bottom cards. After that they stay face-down until a power reveals them.</li>
              <li>Starting player and turn order are random; turns move <strong>clockwise</strong>.</li>
            </ul>
          </section>

          <section className="rules-section">
            <h3 className="rules-section-title">Card Values</h3>
            <div className="rules-card-values">
              <span className="rules-cv-item"><span className="rules-cv-rank">A</span><span className="rules-cv-score">1</span></span>
              <span className="rules-cv-item"><span className="rules-cv-rank">2–10</span><span className="rules-cv-score">face value</span></span>
              <span className="rules-cv-item"><span className="rules-cv-rank">J / Q</span><span className="rules-cv-score">10</span></span>
              <span className="rules-cv-item"><span className="rules-cv-rank">K</span><span className="rules-cv-score">0</span></span>
              <span className="rules-cv-item"><span className="rules-cv-rank">Joker</span><span className="rules-cv-score rules-cv-best">−1</span></span>
            </div>
            <p className="rules-note">Goal: finish with the <strong>lowest total score</strong>. Suits don't matter.</p>
          </section>

          <section className="rules-section">
            <h3 className="rules-section-title">Your Turn</h3>
            <ul className="rules-list">
              <li><strong>Call Kaaboo</strong> — if you think you have the lowest score (see below).</li>
              <li><strong>Draw a card</strong> from the deck (only you see it). Then either:
                <ul className="rules-sublist">
                  <li><strong>Replace</strong> one of your face-down grid cards with the drawn card (the replaced card goes to the discard pile), or</li>
                  <li><strong>Discard</strong> the drawn card directly to the discard pile.</li>
                </ul>
              </li>
            </ul>
          </section>

          <section className="rules-section">
            <h3 className="rules-section-title">Play-Downs <span className="rules-badge">3 sec window</span></h3>
            <ul className="rules-list">
              <li>After any card hits the discard pile, a <strong>3-second window</strong> opens where any eligible player can play a card of the <strong>same rank</strong> from any grid to the discard pile.</li>
              <li>Only the <strong>first</strong> player to do so succeeds. Wrong rank? You draw a penalty card.</li>
              <li>If you play down one of <em>another player's</em> cards, you must <strong>give them one of your cards</strong> within 5 seconds (random card given if you don't).</li>
              <li>If the discard is a <em>replacement</em> card, the current turn player is <strong>not eligible</strong> for the play-down.</li>
            </ul>
          </section>

          <section className="rules-section">
            <h3 className="rules-section-title">Powers <span className="rules-badge">drawn-card discards only</span></h3>
            <p className="rules-note" style={{ marginBottom: 10 }}>Powers trigger only when the current turn player discards their <em>drawn card</em> (not a replacement). The player has 5 seconds to decide whether to use the power, then 20 seconds to execute it.</p>
            <div className="rules-powers">
              <div className="rules-power-row">
                <div className="rules-power-ranks">
                  <span className="rules-rank-badge">7</span>
                  <span className="rules-rank-badge">8</span>
                </div>
                <div className="rules-power-desc">
                  <strong>Peek Self</strong> — look at any one of your own face-down cards.
                </div>
              </div>
              <div className="rules-power-row">
                <div className="rules-power-ranks">
                  <span className="rules-rank-badge">9</span>
                  <span className="rules-rank-badge">10</span>
                </div>
                <div className="rules-power-desc">
                  <strong>Peek Opponent</strong> — look at any one card belonging to another player.
                </div>
              </div>
              <div className="rules-power-row">
                <div className="rules-power-ranks">
                  <span className="rules-rank-badge">J</span>
                </div>
                <div className="rules-power-desc">
                  <strong>Blind Swap</strong> — swap any two cards between any grids (including your own) without looking at either.
                </div>
              </div>
              <div className="rules-power-row">
                <div className="rules-power-ranks">
                  <span className="rules-rank-badge rules-rank-queen">Q</span>
                </div>
                <div className="rules-power-desc">
                  <strong>Double Power</strong> — gain both a <em>Peek any card</em> and a <em>Blind Swap</em>. You can use one, both, or neither — in any order.
                </div>
              </div>
            </div>
          </section>

          <section className="rules-section">
            <h3 className="rules-section-title">Calling Kaaboo</h3>
            <ul className="rules-list">
              <li>On your turn (before drawing), call <strong>Kaaboo</strong> if you believe you have the lowest score.</li>
              <li>Your turn is skipped. The game continues until your turn comes around again, then all cards are revealed.</li>
              <li><strong>Win condition:</strong> your total must be <em>strictly less</em> than every other player (ties don't count). Win → <span className="rules-sb-pos">+1 Scoreboard</span>. Lose → <span className="rules-sb-neg">−1 Scoreboard</span>. Other players are unaffected.</li>
            </ul>
          </section>

          <section className="rules-section">
            <h3 className="rules-section-title">Rounds</h3>
            <ul className="rules-list">
              <li>The host can start a new round after one ends. Scoreboards carry over across rounds.</li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  );
}
