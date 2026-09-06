import qzeybeiLogo from '../assets/qzeybei-logo.png';

export function ProductSignature() {
  return (
    <div className="product-signature">
      <span>a</span>
      <span className="product-signature-logo-frame">
        <img
          className="product-signature-logo"
          src={qzeybeiLogo}
          alt="Qzeybei"
        />
      </span>
      <span>product</span>
    </div>
  );
}
