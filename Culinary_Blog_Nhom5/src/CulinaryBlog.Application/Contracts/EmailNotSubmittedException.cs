namespace CulinaryBlog.Application.Contracts;

/// <summary>Only for failures proven to occur before submitting message data to the transport.</summary>
public sealed class EmailNotSubmittedException() : Exception("Email was not submitted to the transport.");
