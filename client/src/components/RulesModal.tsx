import { Modal } from 'antd';

interface RulesModalProps { open: boolean; onClose: () => void; }

export function RulesModal({ open, onClose }: RulesModalProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      title="How to Play Kaaboo"
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
    >
      <section className="rules-section">
        <h3 className="rules-section-title">Setup</h3>
        <ul className="rules-list">
          <li>54-card deck (13 per suit + 2 Jokers). Each player starts with <strong>4 cards</strong> in a 2×2 grid.</li>
          <li>At game start you have <strong>10 seconds</strong> to peek at your own two bottom cards.</li>
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
          <li><strong>Call Kaaboo</strong> — if you think you have the lowest score.</li>
          <li><strong>Draw a card</strong> from the deck. Then either:
            <ul className="rules-sublist">
              <li><strong>Replace</strong> a grid card with the drawn card.</li>
              <li><strong>Discard</strong> the drawn card directly.</li>
            </ul>
          </li>
        </ul>
      </section>

      <section className="rules-section">
        <h3 className="rules-section-title">Play-Downs <span className="rules-badge">3 sec window</span></h3>
        <ul className="rules-list">
          <li>After any card hits the discard pile, a <strong>3-second window</strong> opens for any eligible player to play a card of the <strong>same rank</strong>.</li>
          <li>Only the <strong>first</strong> player succeeds. Wrong rank → penalty card.</li>
          <li>Playing down another player's card means you <strong>give them one of your cards</strong> within 5 seconds.</li>
        </ul>
      </section>

      <section className="rules-section">
        <h3 className="rules-section-title">Powers</h3>
        <div className="rules-powers">
          <div className="rules-power-row"><div className="rules-power-ranks"><span className="rules-rank-badge">7</span><span className="rules-rank-badge">8</span></div><div className="rules-power-desc"><strong>Peek Self</strong> — look at one of your own face-down cards.</div></div>
          <div className="rules-power-row"><div className="rules-power-ranks"><span className="rules-rank-badge">9</span><span className="rules-rank-badge">10</span></div><div className="rules-power-desc"><strong>Peek Opponent</strong> — look at one opponent card.</div></div>
          <div className="rules-power-row"><div className="rules-power-ranks"><span className="rules-rank-badge">J</span></div><div className="rules-power-desc"><strong>Blind Swap</strong> — swap any two cards.</div></div>
          <div className="rules-power-row"><div className="rules-power-ranks"><span className="rules-rank-badge rules-rank-queen">Q</span></div><div className="rules-power-desc"><strong>Double Power</strong> — peek any card + blind swap.</div></div>
        </div>
      </section>

      <section className="rules-section">
        <h3 className="rules-section-title">Calling Kaaboo</h3>
        <ul className="rules-list">
          <li>On your turn (before drawing), call Kaaboo if you think you have the lowest score.</li>
          <li>Win: total strictly less than every other player → <span className="rules-sb-pos">+1 Scoreboard</span>. Lose → <span className="rules-sb-neg">−1</span>.</li>
        </ul>
      </section>

      <section className="rules-section">
        <h3 className="rules-section-title">Rounds</h3>
        <ul className="rules-list">
          <li>Host can start a new round after one ends. Scoreboards carry over.</li>
        </ul>
      </section>
    </Modal>
  );
}

